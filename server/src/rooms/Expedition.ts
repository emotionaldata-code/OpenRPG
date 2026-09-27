import { Loot } from '../simulation/loot.js';
import { randomUUID } from 'node:crypto';
import type { Adventures } from '../adventure/store.js';
import { Rewards } from '../adventure/rewards.js';
import { Room, ServerError, type Client, type StepContext } from '@colyseus/core';
import {
  WorldState,
  MoveInput,
  RULES,
  parseJoinOptions,
  parseRoomOptions,
  sanitizeInput,
  getMap,
  parseLoadout,
  parseMode,
  type ExpeditionMode,
  type MapId,
} from '@openrpg/shared';
import type { Accounts } from '../auth/accounts.js';
import { AuthError, type Session } from '../auth/accounts.js';
import type { Skins } from '../skins/store.js';
import { Simulation } from '../simulation/world.js';
export abstract class Expedition extends Room<{
  state: WorldState;
  input: MoveInput;
  metadata: { title: string; mapId: MapId; mode: ExpeditionMode };
  client: Client<{ auth: Session }>;
}> {
  abstract readonly accounts: Accounts;
  abstract readonly skins: Skins;
  abstract readonly adventures: Adventures;
  private rewards!: Rewards;
  private loot!: Loot;
  private runId = randomUUID();
  private completionSaved = false;
  private participants = new Set<string>();
  private admissions = 0;
  messages = {
    'save-rewards': async () => {
      await this.rewards.flush();
      return this.rewards.backlog === 0;
    },
    potion: (client: Client) => this.simulation.usePotion(client.sessionId),
  };
  private unsubscribe?: () => void;
  private expiryTimers = new Map<string, { clear(): void }>();
  private sessions = new Map<string, Session>();
  maxClients = RULES.maxPlayers;
  maxMessagesPerSecond = RULES.maxMessagesPerSecond;
  patchRate = RULES.patchMs;
  autoDispose = true;
  state = new WorldState();
  simulation!: Simulation;
  inputs = this.defineInput(MoveInput, {
    bufferMaxSize: RULES.inputBuffer,
    sanitize: sanitizeInput,
  });
  async onCreate(raw: unknown): Promise<void> {
    try {
      const options = parseRoomOptions(raw);
      this.state.visibility = options.visibility;
      this.state.mapId = options.mapId;
      this.state.mode = options.mode;
      this.rewards = new Rewards(this.adventures, (status) => {
        this.state.saveStatus = status;
      });
      this.loot = new Loot(this.state, (id, dropId, reward) => {
        const session = this.sessions.get(id);
        if (session) {
          this.rewards.add(session.profile.id, `${this.runId}:drop:${dropId}`, reward);
        }
      });
      this.simulation = new Simulation(this.state, (mob) => this.loot.spawn(mob));
      await this.setPrivate(options.visibility === 'invite');
      await this.setMetadata({
        title: getMap(options.mapId).name,
        mapId: options.mapId,
        mode: options.mode,
      });
    } catch (error) {
      throw new ServerError(400, error instanceof Error ? error.message : 'Invalid options.');
    }
    this.unsubscribe = this.accounts.onRevoked((accountId, hash) => {
      for (const [id, session] of this.sessions) {
        if (session.profile.id === accountId && (!hash || session.hash === hash)) {
          this.endSession(id);
        }
      }
    });
    this.clock.setInterval(() => {
      void this.rewards.flush();
    }, 5000);
    this.setFixedTimestep((ctx) => this.step(ctx), RULES.tickRate);
  }
  async onJoin(client: Client<{ auth: Session }>, raw: unknown): Promise<void> {
    const { characterClass, skinId, loadout } = parseJoinOptions(raw);
    const accountId = client.auth!.profile.id;
    if (this.state.outcome !== 'active') {
      throw new ServerError(409, 'This expedition has ended. Start a new one.');
    }
    if (this.participants.has(accountId)) {
      throw new ServerError(
        409,
        this.state.mode === 'story'
          ? 'One life per story expedition. Reconnect to your existing seat or start a new expedition.'
          : 'You already have a seat in this expedition.',
      );
    }
    this.participants.add(accountId);
    this.admissions++;
    let revoked = false;
    const stopWatching = this.accounts.onRevoked((id, hash) => {
      if (id === accountId && (!hash || hash === client.auth!.hash)) {
        revoked = true;
      }
    });
    try {
      // Recheck after seat reservation; logout/deletion may have happened since matchmaking.
      const session = await this.accounts.session(client.auth!.hash);
      if (skinId) {
        await this.skins.get(skinId, accountId, characterClass);
      }
      const equipment = parseLoadout(loadout);
      await this.adventures.embark(
        accountId,
        characterClass,
        getMap(this.state.mapId).id,
        parseMode(this.state.mode),
        equipment,
      );
      if (revoked) {
        throw new ServerError(401, 'Your session ended while preparing the expedition.');
      }
      client.auth = session;
      this.sessions.set(client.sessionId, session);
      this.simulation.addPlayer(
        client.sessionId,
        session.profile.username,
        characterClass,
        equipment,
      );
      this.state.players.get(client.sessionId)!.skinId = skinId ?? '';
      if (this.state.players.size === 1) {
        await this.setMetadata({
          ...this.metadata,
          title: `${session.profile.username}'s expedition`,
        });
      }
      this.expiryTimers.set(
        client.sessionId,
        this.clock.setTimeout(
          () => this.endSession(client.sessionId),
          Math.max(0, session.expiresAt - Date.now()),
        ),
      );
    } catch (error) {
      this.participants.delete(accountId);
      throw error instanceof AuthError ? new ServerError(error.status, error.message) : error;
    } finally {
      stopWatching();
      this.admissions--;
    }
  }

  onDrop(client: Client): void {
    const p = this.state.players.get(client.sessionId);
    if (!p) {
      return;
    }
    p.connected = false;
    p.chargeStartedAt = -1;
    this.allowReconnection(client, RULES.reconnectSeconds).catch(() => {
      /* onLeave owns cleanup */
    });
  }
  async onReconnect(client: Client<{ auth: Session }>): Promise<void> {
    await this.accounts.session(client.auth!.hash);
    const p = this.state.players.get(client.sessionId);
    if (!p) {
      throw new ServerError(401, 'Session ended. Please log in again.');
    }
    p.connected = true;
  }
  onLeave(client: Client): void {
    this.expiryTimers.get(client.sessionId)?.clear();
    this.expiryTimers.delete(client.sessionId);
    const session = this.sessions.get(client.sessionId);
    if (session && this.state.mode !== 'story') {
      this.participants.delete(session.profile.id);
    }
    this.sessions.delete(client.sessionId);
    this.simulation.removePlayer(client.sessionId);
    this.loot.removePlayer(client.sessionId);
  }
  private endSession(id: string): void {
    this.simulation.removePlayer(id);
    const client = this.clients.find((c) => c.sessionId === id);
    client?.send('account-ended');
    client?.leave(4011, 'Session ended');
  }
  async onDispose(): Promise<void> {
    this.unsubscribe?.();
    for (let attempt = 0; attempt < 3 && this.rewards?.backlog; attempt++) {
      await this.rewards.flush();
    }
    if (this.rewards?.backlog) {
      console.error(`Expedition ${this.roomId}: rewards could not be saved before disposal.`);
    }
  }
  private step(ctx: StepContext): void {
    // Bound pending writes during database trouble; resume when the retry succeeds.
    if (this.admissions || this.rewards.backlog >= 64 || this.state.saveStatus === 'error') {
      return;
    }
    for (const [id, player] of this.state.players) {
      if (!player.connected) {
        continue;
      }
      // Consume at most one command per tick: extra packets cannot buy extra movement.
      const input = this.inputs.get(id).next();
      if (input) {
        this.simulation.applyInput(id, input, ctx.dt);
      }
    }
    this.simulation.advance(ctx.dt);
    this.loot.step();
    if (this.state.outcome === 'complete' && !this.completionSaved) {
      this.completionSaved = true;
      for (const [id, player] of this.state.players) {
        const session = this.sessions.get(id);
        if (session && player.hp > 0) {
          this.rewards.add(session.profile.id, `${this.runId}:complete`, {
            items: [],
            potions: 0,
            completedMap: getMap(this.state.mapId).id,
          });
        }
      }
    }
  }
}
