import Phaser from 'phaser';
import type { Room, RoomAvailable } from '@colyseus/sdk';
import { WorldState, parseName, RULES } from '@openrpg/shared';
import { client, GameNetwork, type GameRoom } from './network';
import { WoodlandScene } from './scene';
import { paintPreview } from './art';
import './style.css';
const element = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const status = (message: string): void => { element('status').textContent = message; };
let visibility: 'public' | 'invite' = 'public';
let lobbyRoom: Room | undefined;
let gameRoom: GameRoom | undefined;
let network: GameNetwork | undefined;
let game: Phaser.Game | undefined;
let busy = false;
let recoveryTimer: number | undefined;
const rooms = new Map<string, RoomAvailable<{ title: string }>>();
paintPreview(element<HTMLCanvasElement>('preview'));
const savedName = localStorage.getItem('openrpg-name');
if (savedName) element<HTMLInputElement>('name').value = savedName;
const invite = new URL(location.href).searchParams.get('room');
if (invite) { element<HTMLInputElement>('room-id').value = invite; status('An expedition is waiting. Choose your name, then Join.'); }
for (const mode of ['public', 'invite'] as const) element(mode).onclick = () => {
  visibility = mode;
  for (const option of ['public', 'invite']) { element(option).classList.toggle('selected', option === mode); element(option).setAttribute('aria-pressed', String(option === mode)); }
};
function renderRooms(): void {
  const target = element('rooms'); target.replaceChildren();
  for (const room of rooms.values()) {
    const row = document.createElement('div'); row.className = 'room-row';
    const title = document.createElement('span'); title.textContent = room.metadata?.title ?? 'Woodland expedition';
    const count = document.createElement('small'); count.textContent = `${room.clients} / 3`;
    const button = document.createElement('button'); button.textContent = room.clients >= 3 ? 'Full' : 'Join';
    button.disabled = busy || room.clients >= 3; button.onclick = () => void enter(room.roomId);
    row.append(title, count, button); target.append(row);
  }
  if (!rooms.size) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'The woodland is quiet. Start the first expedition.'; target.append(p); }
}
async function connectLobby(): Promise<void> {
  try {
    const room = await client.joinOrCreate('lobby', { filter: { name: 'expedition' } });
    lobbyRoom = room;
    room.onMessage<RoomAvailable<{ title: string }>[]>('rooms', (list) => { rooms.clear(); for (const r of list) rooms.set(r.roomId, r); renderRooms(); });
    room.onMessage<[string, RoomAvailable<{ title: string }>] >('+', ([id, r]) => { rooms.set(id, r); renderRooms(); });
    room.onMessage<string>('-', (id) => { rooms.delete(id); renderRooms(); });
    room.onDrop(() => { element('connection').textContent = 'Reconnecting'; });
    room.onReconnect(() => { element('connection').textContent = 'Live'; });
    room.onLeave(() => {
      if (lobbyRoom === room) { lobbyRoom = undefined; rooms.clear(); renderRooms(); element('connection').textContent = 'Offline'; }
    });
    element('connection').textContent = 'Live';
  } catch { element('connection').textContent = 'Offline'; status('Cannot reach the server. Start npm run dev, then reload to browse rooms.'); }
}
async function enter(id?: string): Promise<void> {
  if (busy || gameRoom) return;
  busy = true; element<HTMLButtonElement>('create').disabled = true; element<HTMLButtonElement>('join').disabled = true; renderRooms();
  try {
    const name = parseName(element<HTMLInputElement>('name').value);
    if (id !== undefined && !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Enter a valid room ID.');
    status('Preparing your expedition…');
    const room: GameRoom = id ? await client.joinById<WorldState>(id, { name }, WorldState) : await client.create<WorldState>('expedition', { name, visibility }, WorldState);
    gameRoom = room; localStorage.setItem('openrpg-name', name);
    room.reconnection.maxRetries = 20;
    room.reconnection.minUptime = 0;
    room.onDrop(() => {
      if (gameRoom !== room || recoveryTimer !== undefined) return;
      recoveryTimer = window.setTimeout(() => {
        if (gameRoom === room) { returnToLobby('Could not reconnect within 15 seconds. Start or join an expedition.'); closeRoom(room); }
      }, RULES.reconnectSeconds * 1000);
    });
    room.onReconnect(() => { if (gameRoom === room) { window.clearTimeout(recoveryTimer); recoveryTimer = undefined; } });
    room.onLeave((code) => { if (gameRoom === room) returnToLobby(code === 4000 ? 'You left the expedition.' : 'Connection ended. Join another expedition or create a new one.'); });
    room.onError((_code, message) => { element('recovery').textContent = message ?? 'Connection error'; });
    // A join resolves before the first snapshot. Wait for our player before mounting Phaser.
    if (!room.state?.players?.has(room.sessionId)) await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { room.onStateChange.remove(check); reject(new Error('The room did not finish loading.')); }, 8000);
      const check = (): void => { if (room.state.players.has(room.sessionId)) { window.clearTimeout(timer); room.onStateChange.remove(check); resolve(); } };
      room.onStateChange(check); check();
    });
    if (gameRoom !== room) return;
    network = new GameNetwork(room);
    element('lobby').hidden = true; element('play').hidden = false;
    element('room-info').textContent = `${room.state.visibility === 'invite' ? 'INVITE ROOM' : 'PUBLIC ROOM'} · ${room.roomId}`;
    element('copy').textContent = 'Copy invite';
    game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', backgroundColor: '#294837', pixelArt: true, antialias: false, banner: false, audio: { noAudio: true }, scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }, scene: new WoodlandScene(network, updateHud) });
    const url = new URL(location.href); url.searchParams.set('room', room.roomId); history.replaceState(null, '', url);
    status('');
  } catch (error) {
    if (gameRoom) { const failed = gameRoom; gameRoom = undefined; await failed.leave(); }
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
  window.clearTimeout(recoveryTimer); recoveryTimer = undefined;
  game?.destroy(true); game = undefined; network?.dispose(); network = undefined; gameRoom = undefined;
  element('game').replaceChildren(); element('play').hidden = true; element('lobby').hidden = false;
  element('recovery').hidden = true; history.replaceState(null, '', location.pathname); status(message);
  if (!lobbyRoom) void connectLobby();
}
function updateHud(net: GameNetwork): void {
  const p = net.room.state.players.get(net.room.sessionId); if (!p) return;
  element('health-text').textContent = `${p.hp} / ${RULES.playerHealth}`;
  element('health-fill').style.width = `${p.hp}%`;
  element('party').textContent = [...net.room.state.players.values()].map((p) => `${p.connected ? '●' : '○'} ${p.name} · ${p.hp > 0 ? `${p.hp} HP` : 'returning'}`).join('\n');
  element('combat-status').textContent = p.hp <= 0 ? `Returning to camp in ${Math.max(0, Math.ceil((p.respawnAt - net.room.state.elapsed) / 1000))}s` : `${p.kills} mages defeated${p.protectedUntil > net.room.state.elapsed ? ' · Protected' : ''}`;
  element('recovery').hidden = net.connected;
  if (!net.connected) element('recovery').textContent = 'Connection lost · finding your way back (up to 15s)…';
  if (import.meta.env.DEV) { const d = net.diagnostics(); element('diagnostics').textContent = `${Math.round(d.rtt)}ms RTT · ${d.drift.toFixed(1)}px drift`; }
}
element('create').onclick = () => void enter();
element<HTMLFormElement>('join-form').onsubmit = (event) => { event.preventDefault(); void enter(element<HTMLInputElement>('room-id').value.trim()); };
element('leave').onclick = () => {
  const room = gameRoom; returnToLobby('You left the expedition.'); if (room) closeRoom(room);
};
element('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); element('copy').textContent = 'Link copied'; }
  catch { element('copy').textContent = `Room: ${gameRoom?.roomId ?? ''}`; }
};
void connectLobby();
if (import.meta.env.DEV) {
  if (new URL(location.href).searchParams.has('debug')) void import('@colyseus/sdk/debug');
  // Read-only telemetry plus a transport-drop hook for reproducible local acceptance tests.
  Object.defineProperty(window, '__openrpg', { get: () => ({
    snapshot: () => network ? { roomId: network.room.roomId, sessionId: network.room.sessionId, connected: network.connected, state: network.room.state.toJSON(), diagnostics: network.diagnostics(), rendered: Object.fromEntries([...network.room.state.players].map(([id, p]) => [id, { x: network!.predict.value(p, 'x'), y: network!.predict.value(p, 'y') }])) } : null,
    drop: () => gameRoom?.connection.close(),
    screenPoint: (x: number, y: number) => {
      const camera = game?.scene.getScene('woodland').cameras.main;
      const point = camera?.getViewMatrix().transformPoint(x, y);
      return point ? { x: point.x, y: point.y + 68 } : null;
    },
  }) });
}
