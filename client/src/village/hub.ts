import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { CloseCode, type Room } from '@colyseus/sdk';
import {
  VillageState,
  VILLAGE_STATIONS,
  RULES,
  type JoinOptions,
  type StationId,
} from '@openrpg/shared';
import { client } from '../game/network';
import { element } from '../ui/dom';
import { Tabs } from '../ui/tabs';
import { VillageNetwork } from './network';
import { VillageScene } from './scene';

/** Owns a single village connection, canvas and interaction dialog. */
export class VillageHub {
  private room?: Room<VillageState>;
  private net?: VillageNetwork;
  private game?: Phaser.Game;
  private revision = 0;
  private recovery?: number;
  private opening = false;
  private closing = false;
  private station?: StationId;
  private dialog = element<HTMLDialogElement>('village-dialog');
  constructor(
    private appearance: () => JoinOptions,
    private portal: (mode: 'testing' | 'story' | 'fight') => void,
    private expired: () => void,
  ) {
    new Tabs(element('shop-tabs'));
    element('village-close').onclick = () => void this.closeDialog();
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      void this.closeDialog();
    });
    element('village-retry').onclick = () => void this.start();
    window.addEventListener('offline', () =>
      this.room?.connection.close(CloseCode.MAY_TRY_RECONNECT),
    );
  }
  async start(): Promise<void> {
    if (this.room) {
      return;
    }
    const revision = ++this.revision;
    element('auth-screen').hidden = true;
    element('village').hidden = false;
    element('village-retry').hidden = true;
    element('village-status').textContent = 'Entering Hearthwick…';
    try {
      const room = await client.joinOrCreate<VillageState>(
        'village',
        this.appearance(),
        VillageState,
      );
      if (revision !== this.revision) {
        await room.leave();
        return;
      }
      this.room = room;
      this.net = new VillageNetwork(room);
      room.reconnection.maxRetries = 20;
      room.reconnection.minUptime = 0;
      room.onMessage('account-ended', () => this.expired());
      room.onDrop(() => {
        if (this.room !== room) {
          return;
        }
        this.dialog.close();
        this.station = undefined;
        this.recovery = window.setTimeout(
          () => this.failed('The village connection ended. Reconnect when ready.'),
          RULES.reconnectSeconds * 1000,
        );
      });
      room.onReconnect(() => {
        if (this.room !== room) {
          return;
        }
        window.clearTimeout(this.recovery);
        element('village-status').textContent = '';
      });
      room.onLeave((code) => {
        if (this.room !== room) {
          return;
        }
        this.failed('You left the village. Reconnect to return.');
        if (code === 4011) {
          this.expired();
        }
      });
      room.onError((_code, message) => {
        element('village-status').textContent = message ?? 'Village connection error.';
      });
      this.game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: 'village-game',
        pixelArt: true,
        antialias: false,
        banner: false,
        audio: { noAudio: true },
        backgroundColor: '#304b39',
        scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
        scene: new VillageScene(
          this.net,
          () => !!document.querySelector('dialog[open]') || this.opening || this.closing,
          (id) => void this.open(id),
        ),
      });
      element('village-status').textContent = '';
    } catch (error) {
      if (revision !== this.revision) {
        return;
      }
      this.failed(error instanceof Error ? error.message : 'Could not enter the village.');
      if ((error as { code?: number }).code === 401) {
        this.expired();
      }
    }
  }
  private async open(id: StationId): Promise<void> {
    const room = this.room;
    if (!room || !this.net?.connected || this.opening || this.dialog.open) {
      return;
    }
    this.opening = true;
    try {
      if (
        !(await room.request<StationId, boolean>('interact', id, { timeout: 4000 })) ||
        this.room !== room
      ) {
        return;
      }
      this.station = id;
      for (const section of ['shop', 'wardrobe', 'account', 'portal']) {
        element(`village-${section}`).hidden =
          section !== (['testing', 'story', 'fight'].includes(id) ? 'portal' : id);
      }
      if (id === 'testing' || id === 'story' || id === 'fight') {
        this.portal(id);
      }
      element('village-dialog-title').textContent = VILLAGE_STATIONS.find((s) => s.id === id)!.name;
      element('village-dialog-status').textContent = '';
      this.dialog.showModal();
      audio.play('click');
    } catch {
      element('village-status').textContent = 'Could not interact. Move closer and try again.';
    } finally {
      this.opening = false;
    }
  }
  private async closeDialog(): Promise<void> {
    if (this.closing) {
      return;
    }
    const room = this.room;
    this.closing = true;
    try {
      if (room && this.net?.connected) {
        if (this.station === 'shop' || this.station === 'wardrobe') {
          const accepted = await room.request<JoinOptions, boolean>(
            'appearance',
            this.appearance(),
            { timeout: 5000 },
          );
          if (!accepted) {
            element('village-status').textContent =
              'Your look could not update. Refresh your supplies or choose an available skin at the tailor.';
          }
        }
        await room.request('interact', '', { timeout: 4000 });
      }
      if (this.room !== room) {
        return;
      }
      this.dialog.close();
      this.station = undefined;
    } catch (error) {
      element('village-dialog-status').textContent =
        error instanceof Error ? error.message : 'Please try again.';
    } finally {
      this.closing = false;
    }
  }
  hideDialog(): void {
    this.dialog.close();
  }
  restoreDialog(): void {
    if (this.station && this.net?.connected && !this.dialog.open) {
      this.dialog.showModal();
    }
  }
  snapshot() {
    const room = this.room;
    return room?.state?.players
      ? {
          roomId: room.roomId,
          sessionId: room.sessionId,
          connected: this.net?.connected ?? false,
          state: room.state.toJSON(),
        }
      : null;
  }
  drop(): void {
    this.room?.connection.close();
  }
  stop(): void {
    this.revision++;
    window.clearTimeout(this.recovery);
    this.dialog.close();
    this.station = undefined;
    const room = this.room;
    this.room = undefined;
    if (room) {
      room.reconnection.enabled = false;
      room.reconnection.maxRetries = 0;
      room.onReconnect(() => {
        void room.leave().catch(() => {});
      });
      if (room.connection.isOpen) {
        void room.leave().catch(() => {});
      }
    }
    this.net?.dispose();
    this.net = undefined;
    this.game?.destroy(true);
    this.game = undefined;
    element('village').hidden = true;
  }
  private failed(message: string): void {
    this.stop();
    element('village').hidden = false;
    element('village-status').textContent = message;
    element('village-retry').hidden = false;
  }
}
