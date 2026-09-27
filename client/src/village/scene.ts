import Phaser from 'phaser';
import { VILLAGE, VILLAGE_STATIONS, nearbyStation, type StationId } from '@openrpg/shared';
import { createTextures } from '../art/art';
import { worldText } from '../art/world-text';
import { RoomSkins } from '../game/room-skins';
import { EquipmentView } from '../game/views/equipment-view';
import { element } from '../ui/dom';
import type { VillageNetwork } from './network';
import { VillageControls } from './controls';
import { drawVillage } from './art';

interface VisitorView {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  gear: EquipmentView;
}
export class VillageScene extends Phaser.Scene {
  private controls!: VillageControls;
  private skins!: RoomSkins;
  private actors = new Map<string, VisitorView>();
  private following = false;
  constructor(
    private net: VillageNetwork,
    private blocked: () => boolean,
    private interact: (id: StationId) => void,
  ) {
    super('village');
  }
  create(): void {
    createTextures(this);
    drawVillage(this);
    this.skins = new RoomSkins(this);
    this.controls = new VillageControls(
      () => this.blocked() || !this.net.connected || !document.getElementById('loading')!.hidden,
      () => {
        const player = this.net.room.state.players.get(this.net.room.sessionId);
        const station = player && nearbyStation(player);
        if (station) {
          this.controls.clear();
          this.interact(station.id);
        }
      },
    );
    this.cameras.main.setBounds(0, 0, VILLAGE.width, VILLAGE.height).centerOn(VILLAGE.spawn.x, 460);
    const resize = (): void => {
      this.cameras.main.setZoom(
        Math.max(1, this.scale.width / VILLAGE.width, this.scale.height / VILLAGE.height),
      );
    };
    resize();
    this.scale.on('resize', resize);
    const dispose = (): void => {
      this.events.off('shutdown', dispose);
      this.events.off('destroy', dispose);
      this.controls.dispose();
      this.scale.off('resize', resize);
    };
    // Destroying a Phaser.Game emits scene destroy without scene shutdown.
    this.events.once('shutdown', dispose);
    this.events.once('destroy', dispose);
  }
  update(time: number): void {
    if (!this.net.room.state?.players) {
      return;
    }
    this.net.frame(time, this.controls.sample());
    const { room, predict } = this.net;
    for (const [id, player] of room.state.players) {
      const texture = this.skins.key(player),
        x = predict.value(player, 'x'),
        y = predict.value(player, 'y');
      let view = this.actors.get(id);
      if (!view) {
        view = {
          sprite: this.add.sprite(x, y, `${texture}-1-0`).setScale(1.8).setOrigin(0.5, 0.8),
          label: worldText(this, x, y - 55, '', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#eee1b6',
            stroke: '#172b24',
            strokeThickness: 2,
            align: 'center',
          }).setOrigin(0.5),
          gear: new EquipmentView(this),
        };
        this.actors.set(id, view);
      }
      const direction = (Math.round(player.aim / (Math.PI / 2)) + 4) % 4;
      if (Math.hypot(x - view.sprite.x, y - view.sprite.y) > 0.1) {
        view.sprite.play(`${texture}-${direction}`, true);
      } else {
        view.sprite.stop();
        view.sprite.setTexture(`${texture}-${direction}-0`);
      }
      view.sprite
        .setPosition(x, y)
        .setDepth(y)
        .setAlpha(player.connected ? 1 : 0.35);
      const activity = VILLAGE_STATIONS.find((s) => s.id === player.activity)?.activity;
      view.label
        .setPosition(x, y - 58)
        .setDepth(y + 1)
        .setText(
          `${player.name}${id === room.sessionId ? ' · YOU' : ''}${activity ? `\n${activity}` : ''}`,
        );
      view.gear.draw(player, view.sprite);
      if (id === room.sessionId && !this.following) {
        this.cameras.main.startFollow(view.sprite, true, 1, 1);
        this.following = true;
      }
    }
    for (const [id, view] of this.actors) {
      if (!room.state.players.has(id)) {
        view.sprite.destroy();
        view.label.destroy();
        view.gear.destroy();
        this.actors.delete(id);
      }
    }
    this.skins.retain(new Set([...room.state.players.values()].map((p) => p.skinId)));
    const self = room.state.players.get(room.sessionId),
      station = self && nearbyStation(self);
    element('village-prompt').textContent = this.net.connected
      ? station
        ? `E · ${station.name}`
        : 'WASD / arrows to walk · E to interact'
      : 'Reconnecting to the village…';
    element('village-count').textContent =
      `${room.state.players.size} / ${VILLAGE.capacity} adventurers · Village ${room.roomId}`;
  }
}
