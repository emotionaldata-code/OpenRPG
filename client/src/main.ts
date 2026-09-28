import { element } from './ui/dom';
import { updateHud } from './game/hud/expedition-hud';
import { RoomBrowser } from './features/lobby/room-browser';
import { audio } from './audio/audio';
import { mountAudio } from './audio/audio-ui';
import { VillageHub } from './village/hub';
import { AdventurePanel } from './features/adventure/adventure';
import Phaser from 'phaser';
import { WorldState, RULES, getMap } from '@openrpg/shared';
import { client, GameNetwork, type GameRoom } from './game/network';
import { ExpeditionScene } from './game/scene';
import { MapSelection } from './features/adventure/map-selection';
import './styles/maps.css';
import { showLoading, hideLoading } from './ui/loading';
import { AccountPanel } from './features/account/account';
import { Wardrobe } from './features/skins/wardrobe';
import { CombatHud } from './game/hud/combat-hud';
import './styles/combat.css';
import { ClassSelection } from './features/adventure/class-selection';
import './styles/style.css';
import './styles/ui.css';
import './styles/adventure.css';
import './styles/village.css';
// This entry point wires features together; room state and visuals stay in game/.
const disposeAudio = mountAudio();
if (import.meta.hot) {
  import.meta.hot.dispose(disposeAudio);
}
const status = (message: string): void => {
  element('status').textContent = message;
  element('village-status').textContent = message;
};
let visibility: 'public' | 'invite' = 'public';
let gameRoom: GameRoom | undefined;
let network: GameNetwork | undefined;
let game: Phaser.Game | undefined;
let busy = false;
let leaveError = '';
let recoveryTimer: number | undefined;
const roomBrowser = new RoomBrowser((id) => void enter(id), status);
const mapSelection = new MapSelection();
const adventure = new AdventurePanel((profile) => mapSelection.setProfile(profile));
const combatHud = new CombatHud(element('abilities'));
const wardrobe = new Wardrobe();
const account = new AccountPanel((profile) => {
  village?.stop();
  element('auth-screen').hidden = !!profile;
  element('account-panel').hidden = false;
  element(profile ? 'village-account' : 'auth-screen').append(element('account-panel'));
  wardrobe.setAccount(profile);
  adventure.setAccount(profile);
  if (gameRoom) {
    const room = gameRoom;
    returnToLobby('Your account session changed.');
    closeRoom(room);
  }
  if (profile) {
    void village.start();
  }
});
const classSelection = new ClassSelection((kind) => {
  wardrobe.setClass(kind);
  adventure.setClass(kind);
});
const invite = new URL(location.href).searchParams.get('room');
if (invite) {
  element<HTMLInputElement>('room-id').value = invite;
  status('An expedition is waiting. Log in, then Join.');
}
for (const mode of ['public', 'invite'] as const) {
  element(mode).onclick = () => {
    visibility = mode;
    for (const option of ['public', 'invite']) {
      element(option).classList.toggle('selected', option === mode);
      element(option).setAttribute('aria-pressed', String(option === mode));
    }
  };
}
async function enter(id?: string): Promise<void> {
  if (busy || gameRoom) {
    return;
  }
  busy = true;
  element<HTMLButtonElement>('create').disabled = true;
  element<HTMLButtonElement>('join').disabled = true;
  roomBrowser.setBusy(busy);
  try {
    if (!account.profile) {
      throw new Error('Please log in before joining an expedition.');
    }
    const accountId = account.profile.id;
    if (!adventure.profile) {
      throw new Error('Wait for your supplies to load, or choose Refresh supplies.');
    }
    if (id !== undefined && !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
      throw new Error('Enter a valid room ID.');
    }
    status('Preparing your expedition…');
    village.hideDialog();
    showLoading('Preparing your expedition…');
    const options = {
      loadout: { ...adventure.loadout },
      characterClass: classSelection.selected,
      ...(wardrobe.selected ? { skinId: wardrobe.selected } : {}),
    };
    const room: GameRoom = id
      ? await client.joinById<WorldState>(id, options, WorldState)
      : await client.create<WorldState>(
          'expedition',
          { visibility, mapId: mapSelection.selected, mode: mapSelection.mode, ...options },
          WorldState,
        );
    if (account.profile?.id !== accountId) {
      await room.leave();
      throw new Error('Your account session changed. Please join again.');
    }
    gameRoom = room;
    room.onMessage('account-ended', () => {
      if (gameRoom === room) {
        returnToLobby('Your account session ended. Please log in again.');
        closeRoom(room);
        void account.restore();
      }
    });
    room.reconnection.maxRetries = 20;
    room.reconnection.minUptime = 0;
    room.onDrop(() => {
      if (gameRoom !== room || recoveryTimer !== undefined) {
        return;
      }
      recoveryTimer = window.setTimeout(() => {
        if (gameRoom === room) {
          returnToLobby('Could not reconnect within 15 seconds. Start or join an expedition.');
          closeRoom(room);
        }
      }, RULES.reconnectSeconds * 1000);
    });
    room.onReconnect(() => {
      if (gameRoom === room) {
        window.clearTimeout(recoveryTimer);
        recoveryTimer = undefined;
      }
    });
    room.onLeave((code) => {
      if (code === 4011) {
        void account.restore();
      }
      if (gameRoom === room) {
        returnToLobby(
          code === 4011
            ? 'Your account session ended. Please log in again.'
            : code === 4000
              ? 'You left the expedition.'
              : 'Connection ended. Join another expedition or create a new one.',
        );
      }
    });
    room.onError((_code, message) => {
      element('recovery').textContent = message ?? 'Connection error';
    });
    // A join resolves before the first snapshot. Wait for our player before mounting Phaser.
    if (!room.state?.players?.has(room.sessionId)) {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          room.onStateChange.remove(check);
          reject(new Error('The room did not finish loading.'));
        }, 8000);
        const check = (): void => {
          if (room.state.players.has(room.sessionId)) {
            window.clearTimeout(timer);
            room.onStateChange.remove(check);
            resolve();
          }
        };
        room.onStateChange(check);
        check();
      });
    }
    if (gameRoom !== room) {
      return;
    }
    village.stop();
    network = new GameNetwork(room);
    audio.setMusic('adventure');
    element('lobby').hidden = true;
    element('play').hidden = false;
    element('game-map-name').textContent = getMap(room.state.mapId).name.toUpperCase();
    element('room-info').textContent =
      `${room.state.mode.toUpperCase()} · ${getMap(room.state.mapId).subtitle.toUpperCase()} · ${room.state.visibility === 'invite' ? 'INVITE ROOM' : 'PUBLIC ROOM'} · ${room.roomId}`;
    element('copy').textContent = 'Copy invite';
    const scene = new ExpeditionScene(network, (net) => updateHud(net, combatHud, leaveError));
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      backgroundColor: '#294837',
      pixelArt: true,
      antialias: false,
      banner: false,
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      scene,
    });
    game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      if (gameRoom === room) {
        hideLoading(() => {
          if (gameRoom === room) {
            network?.start();
          }
        });
      }
    });
    const url = new URL(location.href);
    url.searchParams.set('room', room.roomId);
    history.replaceState(null, '', url);
    status('');
  } catch (error) {
    hideLoading(() => village.restoreDialog());
    if (gameRoom) {
      const failed = gameRoom;
      gameRoom = undefined;
      await failed.leave();
    }
    if ((error as { code?: number }).code === 401) {
      void account.restore();
    }
    status(
      error instanceof Error
        ? error.message
        : 'Could not join this room. It may be full or closed.',
    );
  } finally {
    busy = false;
    element<HTMLButtonElement>('create').disabled = false;
    element<HTMLButtonElement>('join').disabled = false;
    roomBrowser.setBusy(busy);
  }
}
function closeRoom(room: GameRoom): void {
  room.reconnection.enabled = false;
  room.reconnection.maxRetries = 0;
  // A retry already scheduled by SDK 0.18 may still open once. Close that seat too.
  room.onReconnect(() => {
    void room.leave().catch(() => {});
  });
  if (room.connection.isOpen) {
    void room.leave().catch(() => {});
  }
}
function returnToLobby(message: string): void {
  audio.setMusic('menu');
  leaveError = '';
  hideLoading();
  window.clearTimeout(recoveryTimer);
  recoveryTimer = undefined;
  game?.destroy(true);
  game = undefined;
  network?.dispose();
  network = undefined;
  gameRoom = undefined;
  element('game').replaceChildren();
  element('play').hidden = true;
  element('lobby').hidden = false;
  element('recovery').hidden = true;
  history.replaceState(null, '', location.pathname);
  status(message);
  if (account.profile) {
    void village.start();
  }
  void adventure.refresh();
  void roomBrowser.connect();
}
element('create').onclick = () => void enter();
element<HTMLFormElement>('join-form').onsubmit = (event) => {
  event.preventDefault();
  void enter(element<HTMLInputElement>('room-id').value.trim());
};
element('leave').onclick = async () => {
  const room = gameRoom;
  if (!room) {
    return;
  }
  const button = element<HTMLButtonElement>('leave');
  button.disabled = true;
  leaveError = '';
  try {
    if (
      network?.connected &&
      !(await room.request<undefined, boolean>('save-rewards', undefined, { timeout: 10000 }))
    ) {
      throw new Error('Rewards are still saving. Please try leaving again shortly.');
    }
    returnToLobby('Expedition ended. Carried potions are spent; your collection is safe.');
    closeRoom(room);
  } catch (error) {
    leaveError = error instanceof Error ? error.message : 'Could not save rewards. Try again.';
  } finally {
    button.disabled = false;
  }
};
element('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    element('copy').textContent = 'Link copied';
  } catch {
    element('copy').textContent = `Room: ${gameRoom?.roomId ?? ''}`;
  }
};
const village = new VillageHub(
  () => ({
    characterClass: classSelection.selected,
    skinId: wardrobe.selected,
    loadout: { ...adventure.loadout },
  }),
  (mode) => {
    mapSelection.setMode(mode);
    roomBrowser.setMode(mode);
    for (const kind of ['testing', 'story', 'fight']) {
      element(`${kind}-rules`).hidden = kind !== mode;
    }
    element('portal-loadout').textContent =
      `${classSelection.selected.toUpperCase()} · ${adventure.loadout.potions} potions packed. Change class and equipment at the quartermaster; skins at the tailor.`;
  },
  () => void account.restore(),
);
await account.restore();
void roomBrowser.connect();
if (import.meta.env.DEV) {
  const { installDiagnostics } = await import('./game/diagnostics');
  installDiagnostics(() => ({ network, game, gameRoom }), village);
}
