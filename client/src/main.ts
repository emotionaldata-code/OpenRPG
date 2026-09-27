import { audio } from './audio/audio';
import { mountAudio } from './audio/audio-ui';
import { Tabs } from './tabs';
import { AdventurePanel } from './adventure';
import Phaser from 'phaser';
import type { Room, RoomAvailable } from '@colyseus/sdk';
import { WorldState, RULES, getMap, ENEMY_THEMES, enemyRules, EXPEDITION_MODES, type MapId, type ExpeditionMode } from '@openrpg/shared';
import { client, GameNetwork, type GameRoom } from './network';
import { ExpeditionScene } from './scene';
import { MapSelection } from './map-selection';
import './maps.css';
import { showLoading, hideLoading } from './loading';
import { AccountPanel } from './account';
import { Wardrobe } from './wardrobe';
import { CombatHud } from './combat-hud';
import './combat.css';
import { ClassSelection } from './class-selection';
import './style.css';
import './ui.css';
import './adventure.css';
const disposeAudio = mountAudio();
if (import.meta.hot) import.meta.hot.dispose(disposeAudio);
const element = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const status = (message: string): void => { element('status').textContent = message; };
let visibility: 'public' | 'invite' = 'public';
let lobbyRoom: Room | undefined;
let gameRoom: GameRoom | undefined;
let network: GameNetwork | undefined;
let game: Phaser.Game | undefined;
let busy = false;
let leaveError = '';
let recoveryTimer: number | undefined;
const rooms = new Map<string, RoomAvailable<{ title: string; mapId: MapId; mode: ExpeditionMode }>>();
const mapSelection = new MapSelection();
const preparationTabs = new Tabs(element('preparation-tabs'));
new Tabs(element('path-tabs'), id => mapSelection.setMode(id === 'tab-story' ? 'story' : id === 'tab-fight' ? 'fight' : 'testing'));
const adventure = new AdventurePanel(profile => mapSelection.setProfile(profile));
const combatHud = new CombatHud(element('abilities'));
const wardrobe = new Wardrobe();
const account = new AccountPanel(profile => {
  wardrobe.setAccount(profile); adventure.setAccount(profile);
  if (gameRoom) { const room = gameRoom; returnToLobby('Your account session changed.'); closeRoom(room); }
});
const classSelection = new ClassSelection(kind => { wardrobe.setClass(kind); adventure.setClass(kind); });
element('prepare-adventure').onclick = () => preparationTabs.select('tab-adventure');
element('account-focus').onclick = () => { preparationTabs.select('tab-adventurer'); element('account-panel').scrollIntoView({ behavior: 'smooth', block: 'center' }); element<HTMLInputElement>('username').focus({ preventScroll: true }); };
const invite = new URL(location.href).searchParams.get('room');
if (invite) { element<HTMLInputElement>('room-id').value = invite; status('An expedition is waiting. Log in, then Join.'); }
for (const mode of ['public', 'invite'] as const) element(mode).onclick = () => {
  visibility = mode;
  for (const option of ['public', 'invite']) { element(option).classList.toggle('selected', option === mode); element(option).setAttribute('aria-pressed', String(option === mode)); }
};
function renderRooms(): void {
  const target = element('rooms'); target.replaceChildren();
  for (const room of rooms.values()) {
    const row = document.createElement('div'); row.className = 'room-row';
    const title = document.createElement('span'); title.textContent = `${EXPEDITION_MODES[room.metadata?.mode ?? 'testing']} · ${room.metadata?.title ?? 'Expedition'} · ${getMap(room.metadata?.mapId ?? 'forest').subtitle}`;
    const count = document.createElement('small'); count.textContent = `${room.clients} / 3`;
    const button = document.createElement('button'); button.textContent = room.clients >= 3 ? 'Full' : 'Join';
    button.dataset.sound = 'important';
    button.disabled = busy || room.clients >= 3; button.onclick = () => void enter(room.roomId);
    row.append(title, count, button); target.append(row);
  }
  if (!rooms.size) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'The realms are quiet. Start the first expedition.'; target.append(p); }
}
async function connectLobby(): Promise<void> {
  try {
    const room = await client.joinOrCreate('lobby', { filter: { name: 'expedition' } });
    lobbyRoom = room;
    room.onMessage<RoomAvailable<{ title: string; mapId: MapId; mode: ExpeditionMode }>[]>('rooms', (list) => { rooms.clear(); for (const r of list) rooms.set(r.roomId, r); renderRooms(); });
    room.onMessage<[string, RoomAvailable<{ title: string; mapId: MapId; mode: ExpeditionMode }>] >('+', ([id, r]) => { rooms.set(id, r); renderRooms(); });
    room.onMessage<string>('-', (id) => { rooms.delete(id); renderRooms(); });
    room.onDrop(() => { element('connection').textContent = 'Reconnecting'; });
    room.onReconnect(() => { element('connection').textContent = 'Live'; });
    room.onLeave(() => {
      if (lobbyRoom === room) { lobbyRoom = undefined; rooms.clear(); renderRooms(); element('connection').textContent = 'Offline'; }
    });
    element('connection').textContent = 'Live';
  } catch { element('connection').textContent = 'Offline'; status('Cannot reach the realms. Check your connection, then reload to try again.'); }
}
async function enter(id?: string): Promise<void> {
  if (busy || gameRoom) return;
  busy = true; element<HTMLButtonElement>('create').disabled = true; element<HTMLButtonElement>('join').disabled = true; renderRooms();
  try {
    if (!account.profile) throw new Error('Please log in before joining an expedition.');
    const accountId = account.profile.id;
    if (!adventure.profile) throw new Error('Wait for your supplies to load, or choose Refresh supplies.');
    if (id !== undefined && !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Enter a valid room ID.');
    status('Preparing your expedition…');
    showLoading('Preparing your expedition…');
    const options = { loadout: { ...adventure.loadout }, characterClass: classSelection.selected, ...(wardrobe.selected ? { skinId: wardrobe.selected } : {}) };
    const room: GameRoom = id ? await client.joinById<WorldState>(id, options, WorldState) : await client.create<WorldState>('expedition', { visibility, mapId: mapSelection.selected, mode: mapSelection.mode, ...options }, WorldState);
    if (account.profile?.id !== accountId) { await room.leave(); throw new Error('Your account session changed. Please join again.'); }
    gameRoom = room;
    room.onMessage('account-ended', () => {
      if (gameRoom === room) { returnToLobby('Your account session ended. Please log in again.'); closeRoom(room); void account.restore(); }
    });
    room.reconnection.maxRetries = 20;
    room.reconnection.minUptime = 0;
    room.onDrop(() => {
      if (gameRoom !== room || recoveryTimer !== undefined) return;
      recoveryTimer = window.setTimeout(() => {
        if (gameRoom === room) { returnToLobby('Could not reconnect within 15 seconds. Start or join an expedition.'); closeRoom(room); }
      }, RULES.reconnectSeconds * 1000);
    });
    room.onReconnect(() => { if (gameRoom === room) { window.clearTimeout(recoveryTimer); recoveryTimer = undefined; } });
    room.onLeave((code) => { if (code === 4011) void account.restore(); if (gameRoom === room) returnToLobby(code === 4011 ? 'Your account session ended. Please log in again.' : code === 4000 ? 'You left the expedition.' : 'Connection ended. Join another expedition or create a new one.'); });
    room.onError((_code, message) => { element('recovery').textContent = message ?? 'Connection error'; });
    // A join resolves before the first snapshot. Wait for our player before mounting Phaser.
    if (!room.state?.players?.has(room.sessionId)) await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { room.onStateChange.remove(check); reject(new Error('The room did not finish loading.')); }, 8000);
      const check = (): void => { if (room.state.players.has(room.sessionId)) { window.clearTimeout(timer); room.onStateChange.remove(check); resolve(); } };
      room.onStateChange(check); check();
    });
    if (gameRoom !== room) return;
    network = new GameNetwork(room);
    audio.setMusic('adventure');
    element('lobby').hidden = true; element('play').hidden = false;
    element('game-map-name').textContent = getMap(room.state.mapId).name.toUpperCase();
    element('room-info').textContent = `${room.state.mode.toUpperCase()} · ${getMap(room.state.mapId).subtitle.toUpperCase()} · ${room.state.visibility === 'invite' ? 'INVITE ROOM' : 'PUBLIC ROOM'} · ${room.roomId}`;
    element('copy').textContent = 'Copy invite';
    const scene = new ExpeditionScene(network, updateHud);
    game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', backgroundColor: '#294837', pixelArt: true, antialias: false, banner: false, audio: { noAudio: true }, scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }, scene });
    game.events.once(Phaser.Core.Events.POST_RENDER, () => { if (gameRoom === room) hideLoading(); });
    const url = new URL(location.href); url.searchParams.set('room', room.roomId); history.replaceState(null, '', url);
    status('');
  } catch (error) {
    hideLoading();
    if (gameRoom) { const failed = gameRoom; gameRoom = undefined; await failed.leave(); }
    if ((error as { code?: number }).code === 401) void account.restore();
    status(error instanceof Error ? error.message : 'Could not join this room. It may be full or closed.');
  } finally { busy = false; element<HTMLButtonElement>('create').disabled = false; element<HTMLButtonElement>('join').disabled = false; renderRooms(); }
}
function closeRoom(room: GameRoom): void {
  room.reconnection.enabled = false;
  room.reconnection.maxRetries = 0;
  // A retry already scheduled by SDK 0.18 may still open once. Close that seat too.
  room.onReconnect(() => { void room.leave().catch(() => {}); });
  if (room.connection.isOpen) void room.leave().catch(() => {});
}
function returnToLobby(message: string): void {
  audio.setMusic('menu');
  leaveError = '';
  hideLoading();
  window.clearTimeout(recoveryTimer); recoveryTimer = undefined;
  game?.destroy(true); game = undefined; network?.dispose(); network = undefined; gameRoom = undefined;
  element('game').replaceChildren(); element('play').hidden = true; element('lobby').hidden = false;
  element('recovery').hidden = true; history.replaceState(null, '', location.pathname); status(message);
  void adventure.refresh();
  if (!lobbyRoom) void connectLobby();
}
function updateHud(net: GameNetwork): void {
  const p = net.room.state.players.get(net.room.sessionId); if (!p) return;
  combatHud.update(p, net.serverTime, net.connected);
  element('health-text').textContent = `${p.hp} / ${RULES.playerHealth}`;
  element('health-fill').style.width = `${p.hp}%`;
  element('party').textContent = [...net.room.state.players.values()].map((p) => `${p.connected ? '●' : '○'} ${p.name} · ${p.hp > 0 ? `${p.hp} HP` : net.room.state.mode === 'story' ? 'fallen' : 'returning'}`).join('\n');
  const state = net.room.state, story = state.mode === 'story';
  element('combat-status').textContent = p.hp <= 0 ? story ? 'You have fallen · no respawn in Story' : `Returning to camp in ${Math.max(0, Math.ceil((p.respawnAt - state.elapsed) / 1000))}s` : `${p.kills} ${state.mode === 'fight' ? 'players' : 'enemies'} defeated${p.protectedUntil > state.elapsed ? ' · Protected' : ''}`;
  if (state.mode === 'fight' && state.players.size < 2) element('combat-status').textContent += ' · Invite an opponent to fight';
  const boss = [...state.mobs.values()].find(m => m.role === 'boss');
  if (boss) element('combat-status').textContent += ` · ${ENEMY_THEMES[getMap(state.mapId).id].names.boss}: ${boss.hp > 0 ? `${boss.hp}/${enemyRules('boss').health} HP` : story ? 'defeated' : `returns in ${Math.max(0, Math.ceil((boss.respawnAt - state.elapsed) / 1000))}s`}`;
  element('potion-hud').textContent = `R · ${p.potions} health potion${p.potions === 1 ? '' : 's'} · +50 HP${p.nextPotionAt > net.serverTime ? ' · cooling down' : ''}`;
  element('loot-notice').hidden = !p.lootNotice || (state.outcome === 'active' && state.elapsed - p.lootAt > 5000);
  element('loot-notice').textContent = `${p.lootNotice} · ${state.saveStatus === 'saved' ? 'Saved to your collection' : state.saveStatus === 'error' ? 'Save interrupted; retrying…' : 'Saving…'}`;
  element('expedition-result').classList.toggle('victory', state.outcome === 'complete');
  element('expedition-result').hidden = state.outcome === 'active' && !(story && p.hp <= 0) && state.saveStatus !== 'error';
  element('expedition-result').textContent = state.saveStatus === 'error' ? 'Storage is unavailable. The expedition is paused while your rewards are saved.' : state.outcome === 'complete' ? `Realm cleared. ${p.hp > 0 ? 'Story progress earned.' : 'You fell before the realm was cleared.'} ${state.saveStatus === 'saved' ? 'Walk over your remaining loot, then return to camp.' : 'Saving your rewards…'}` : state.outcome === 'failed' ? 'Your party has fallen. Your collected gear is safe. Leave to try again.' : 'You have fallen. Your party can continue. Leave when you are ready.';
  element('recovery').hidden = net.connected && !leaveError;
  if (leaveError) element('recovery').textContent = leaveError;
  if (!net.connected) element('recovery').textContent = 'Connection lost · finding your way back (up to 15s)…';
  if (import.meta.env.DEV) { const d = net.diagnostics(); element('diagnostics').textContent = `${Math.round(d.rtt)}ms RTT · ${d.drift.toFixed(1)}px drift`; }
}
element('create').onclick = () => void enter();
element<HTMLFormElement>('join-form').onsubmit = (event) => { event.preventDefault(); void enter(element<HTMLInputElement>('room-id').value.trim()); };
element('leave').onclick = async () => {
  const room = gameRoom; if (!room) return;
  const button = element<HTMLButtonElement>('leave'); button.disabled = true; leaveError = '';
  try {
    if (network?.connected && !await room.request<undefined, boolean>('save-rewards', undefined, { timeout: 10000 })) throw new Error('Rewards are still saving. Please try leaving again shortly.');
    returnToLobby('Expedition ended. Carried potions are spent; your collection is safe.'); closeRoom(room);
  } catch (error) { leaveError = error instanceof Error ? error.message : 'Could not save rewards. Try again.'; }
  finally { button.disabled = false; }
};
element('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); element('copy').textContent = 'Link copied'; }
  catch { element('copy').textContent = `Room: ${gameRoom?.roomId ?? ''}`; }
};
await account.restore();
void connectLobby();
if (import.meta.env.DEV) {
  if (new URL(location.href).searchParams.has('debug')) void import('@colyseus/sdk/debug');
  // Read-only telemetry plus a transport-drop hook for reproducible local acceptance tests.
  Object.defineProperty(window, '__openrpg', { get: () => ({
    audio: () => ({ ...audio.diagnostics, enabled: audio.isEnabled, audible: audio.audible }),
    snapshot: () => network ? { roomId: network.room.roomId, sessionId: network.room.sessionId, connected: network.connected, state: network.room.state.toJSON(), diagnostics: network.diagnostics(), chargeProgress: (game?.scene.getScene('expedition') as ExpeditionScene | undefined)?.chargeProgress ?? null, rendered: Object.fromEntries([...network.room.state.players].map(([id, p]) => [id, { x: network!.predict.value(p, 'x'), y: network!.predict.value(p, 'y'), equipment: (game?.scene.getScene('expedition') as ExpeditionScene | undefined)?.actorEquipment(id), texture: (game?.scene.getScene('expedition') as ExpeditionScene | undefined)?.actorTexture(id) }])) } : null,
    drop: () => gameRoom?.connection.close(),
    screenPoint: (x: number, y: number) => {
      const camera = game?.scene.getScene('expedition').cameras.main;
      const point = camera?.getViewMatrix().transformPoint(x, y);
      return point ? { x: point.x, y: point.y + 68 } : null;
    },
  }) });
}
