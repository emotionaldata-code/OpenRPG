import { Room, ServerError, type Client } from '@colyseus/core';
import {
  VillageState,
  Villager,
  VILLAGE,
  VILLAGE_WALLS,
  nearbyStation,
  MoveInput,
  RULES,
  sanitizeInput,
  movePlayer,
  parseJoinOptions,
  parseLoadout,
  item,
  ownedQuantity,
} from '@openrpg/shared';
import type { Accounts, Session } from '../auth/accounts.js';
import type { Adventures } from '../adventure/store.js';
import type { Skins } from '../skins/store.js';

type Visitor = Client<{ auth: Session }>;
export abstract class Village extends Room<{
  state: VillageState;
  input: MoveInput;
  client: Visitor;
}> {
  abstract readonly accounts: Accounts;
  abstract readonly skins: Skins;
  abstract readonly adventures: Adventures;
  state = new VillageState();
  maxClients = VILLAGE.capacity;
  maxMessagesPerSecond = RULES.maxMessagesPerSecond;
  patchRate = RULES.patchMs;
  private unsubscribe?: () => void;
  private expiries = new Map<string, { clear(): void }>();
  private updating = new Set<string>();
  private lastAppearance = new Map<string, number>();
  inputs = this.defineInput(MoveInput, {
    bufferMaxSize: RULES.inputBuffer,
    sanitize: sanitizeInput,
  });
  messages = {
    interact: (client: Visitor, id: unknown): boolean => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.connected) {
        return false;
      }
      if (id === '') {
        player.activity = '';
        return true;
      }
      const station = nearbyStation(player);
      if (!station || station.id !== id) {
        return false;
      }
      player.activity = station.id;
      return true;
    },
    appearance: async (client: Visitor, raw: unknown): Promise<boolean> => {
      const id = client.sessionId,
        player = this.state.players.get(id);
      if (
        !player?.connected ||
        !['shop', 'wardrobe'].includes(player.activity) ||
        this.updating.has(id) ||
        this.clock.elapsedTime - (this.lastAppearance.get(id) ?? -1000) < 500
      ) {
        return false;
      }
      this.updating.add(id);
      this.lastAppearance.set(id, this.clock.elapsedTime);
      try {
        const look = await this.appearance(client, raw);
        if (this.state.players.get(id) !== player) {
          return false;
        }
        Object.assign(player, look);
        return true;
      } catch {
        return false;
      } finally {
        this.updating.delete(id);
      }
    },
  };
  onCreate(): void {
    this.unsubscribe = this.accounts.onRevoked((accountId, hash) => {
      for (const client of this.clients) {
        if (client.auth?.profile.id === accountId && (!hash || client.auth.hash === hash)) {
          this.endSession(client);
        }
      }
    });
    this.setFixedTimestep((ctx) => {
      for (const [id, player] of this.state.players) {
        const input = this.inputs.get(id).next();
        // Consume commands while in a dialog too, keeping acknowledgements current.
        if (input && !player.activity) {
          movePlayer(player, input, ctx.dt, VILLAGE_WALLS);
        }
      }
    }, RULES.tickRate);
  }
  async onJoin(client: Visitor, raw: unknown): Promise<void> {
    // Watch the admission as well as connected clients: deletion may race an async DB read.
    let revoked = false;
    const stop = this.accounts.onRevoked((id, hash) => {
      if (id === client.auth!.profile.id && (!hash || hash === client.auth!.hash)) {
        revoked = true;
      }
    });
    try {
      const look = await this.appearance(client, raw);
      client.auth = await this.accounts.session(client.auth!.hash);
      if (revoked) {
        throw new ServerError(401, 'Your session ended.');
      }
      this.state.players.set(
        client.sessionId,
        new Villager({
          ...VILLAGE.spawn,
          x: VILLAGE.spawn.x + [0, -40, 40, -80, 80][this.state.players.size % 5]!,
          y: VILLAGE.spawn.y + Math.floor(this.state.players.size / 5) * 32,
          ...look,
          name: client.auth.profile.username,
        }),
      );
      this.expiries.set(
        client.sessionId,
        this.clock.setTimeout(
          () => this.endSession(client),
          Math.max(0, client.auth.expiresAt - Date.now()),
        ),
      );
    } finally {
      stop();
    }
  }
  private async appearance(client: Visitor, raw: unknown) {
    const { characterClass, skinId, loadout } = parseJoinOptions(raw);
    const equipment = parseLoadout(loadout),
      id = client.auth!.profile.id;
    if (skinId) {
      await this.skins.get(skinId, id, characterClass);
    }
    const profile = await this.adventures.profile(id);
    for (const slot of ['weapon', 'armor'] as const) {
      if (
        equipment[slot] &&
        (item(equipment[slot])?.characterClass !== characterClass ||
          !ownedQuantity(profile, equipment[slot]))
      ) {
        throw new ServerError(403, 'Equip collected gear for your class.');
      }
    }
    return {
      characterClass,
      skinId: skinId ?? '',
      weapon: equipment.weapon,
      armor: equipment.armor,
    };
  }
  onDrop(client: Visitor): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) {
      return;
    }
    player.connected = false;
    player.activity = '';
    this.allowReconnection(client, RULES.reconnectSeconds).catch(() => {
      /* onLeave owns cleanup. */
    });
  }
  async onReconnect(client: Visitor): Promise<void> {
    await this.accounts.session(client.auth!.hash);
    const player = this.state.players.get(client.sessionId);
    if (!player) {
      throw new ServerError(401, 'Session ended.');
    }
    player.connected = true;
  }
  onLeave(client: Visitor): void {
    this.state.players.delete(client.sessionId);
    this.expiries.get(client.sessionId)?.clear();
    this.expiries.delete(client.sessionId);
    this.lastAppearance.delete(client.sessionId);
    this.updating.delete(client.sessionId);
  }
  private endSession(client: Visitor): void {
    this.state.players.delete(client.sessionId);
    client.send('account-ended');
    client.leave(4011, 'Session ended');
  }
  onDispose(): void {
    this.unsubscribe?.();
  }
}
