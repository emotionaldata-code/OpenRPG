import type { Room, RoomAvailable } from '@colyseus/sdk';
import { EXPEDITION_MODES, getMap, type MapId, type ExpeditionMode } from '@openrpg/shared';
import { client } from '../../game/network';
import { element } from '../../ui/dom';

type ListedRoom = RoomAvailable<{ title: string; mapId: MapId; mode: ExpeditionMode }>;

/** Public discovery has its own connection, independent of the active expedition. */
export class RoomBrowser {
  private room?: Room;
  private rooms = new Map<string, ListedRoom>();
  private busy = false;
  private mode: ExpeditionMode = 'testing';
  setMode(mode: ExpeditionMode): void {
    this.mode = mode;
    this.render();
  }
  constructor(
    private join: (id: string) => void,
    private status: (message: string) => void,
  ) {}
  setBusy(busy: boolean): void {
    this.busy = busy;
    this.render();
  }
  private render(): void {
    const target = element('rooms');
    target.replaceChildren();
    for (const room of this.rooms.values()) {
      if ((room.metadata?.mode ?? 'testing') !== this.mode) {
        continue;
      }
      const row = document.createElement('div');
      row.className = 'room-row';
      const title = document.createElement('span');
      title.textContent = `${EXPEDITION_MODES[room.metadata?.mode ?? 'testing']} · ${room.metadata?.title ?? 'Expedition'} · ${getMap(room.metadata?.mapId ?? 'forest').subtitle}`;
      const count = document.createElement('small');
      count.textContent = `${room.clients} / 3`;
      const button = document.createElement('button');
      button.textContent = room.clients >= 3 ? 'Full' : 'Join';
      button.dataset.sound = 'important';
      button.disabled = this.busy || room.clients >= 3;
      button.onclick = () => this.join(room.roomId);
      row.append(title, count, button);
      target.append(row);
    }
    if (!target.childElementCount) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'The realms are quiet. Start the first expedition.';
      target.append(p);
    }
  }
  async connect(): Promise<void> {
    try {
      if (this.room) {
        return;
      }
      const room = await client.joinOrCreate('lobby', { filter: { name: 'expedition' } });
      this.room = room;
      room.onMessage<ListedRoom[]>('rooms', (list) => {
        this.rooms.clear();
        for (const r of list) {
          this.rooms.set(r.roomId, r);
        }
        this.render();
      });
      room.onMessage<[string, ListedRoom]>('+', ([id, r]) => {
        this.rooms.set(id, r);
        this.render();
      });
      room.onMessage<string>('-', (id) => {
        this.rooms.delete(id);
        this.render();
      });
      room.onDrop(() => {
        element('connection').textContent = 'Reconnecting';
      });
      room.onReconnect(() => {
        element('connection').textContent = 'Live';
      });
      room.onLeave(() => {
        if (this.room === room) {
          this.room = undefined;
          this.rooms.clear();
          this.render();
          element('connection').textContent = 'Offline';
        }
      });
      element('connection').textContent = 'Live';
    } catch {
      element('connection').textContent = 'Offline';
      this.status('Cannot reach the realms. Check your connection, then reload to try again.');
    }
  }
}
