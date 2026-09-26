import Phaser from 'phaser';
import { RULES, WORLD, type Player, type Mob } from '@openrpg/shared';
import { createTextures, drawWorld } from './art';
import { Controls } from './controls';
import { GameNetwork } from './network';
interface ActorView { sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; bar: Phaser.GameObjects.Graphics; x: number; y: number }
export class WoodlandScene extends Phaser.Scene {
  private controls!: Controls;
  private actors = new Map<string, ActorView>();
  private shots = new Map<string, Phaser.GameObjects.Image>();
  private aimLine!: Phaser.GameObjects.Graphics;
  private following = false;
  constructor(private net: GameNetwork, private hud: (net: GameNetwork) => void) { super('woodland'); }
  create(): void {
    createTextures(this); drawWorld(this);
    this.controls = new Controls(this);
    this.aimLine = this.add.graphics().setDepth(2000);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height).setZoom(1.3);
    this.cameras.main.centerOn(250, 790);
    this.net.room.onDrop(this.controls.clear);
    this.net.room.onReconnect(this.controls.clear);
    this.events.once('shutdown', () => {
      this.net.room.onDrop.remove(this.controls.clear); this.net.room.onReconnect.remove(this.controls.clear);
      this.controls.dispose();
    });
  }
  update(time: number): void {
    const room = this.net.room;
    const self = room.state.players.get(room.sessionId);
    const position = self ? { x: this.net.predict.value(self, 'x'), y: this.net.predict.value(self, 'y') } : { x: 250, y: 790 };
    const intent = this.controls.sample(position);
    this.net.frame(time, intent);
    const live = new Set<string>();
    for (const [id, p] of room.state.players) { live.add(id); this.drawActor(id, p, 'archer', id === room.sessionId ? intent.aim : p.aim); }
    for (const [id, m] of room.state.mobs) { live.add(id); this.drawActor(id, m, 'mage', m.aim); }
    for (const [id, v] of this.actors) if (!live.has(id)) { v.sprite.destroy(); v.label.destroy(); v.bar.destroy(); this.actors.delete(id); }
    const localView = this.actors.get(room.sessionId);
    if (localView && !this.following) { this.cameras.main.startFollow(localView.sprite, true, 1, 1); this.following = true; }
    this.aimLine.clear();
    if (localView && self && self.hp > 0) {
      const x = localView.sprite.x, y = localView.sprite.y;
      this.aimLine.lineStyle(1, 0xe2cd92, .4).lineBetween(x + Math.cos(intent.aim) * 18, y + Math.sin(intent.aim) * 18, x + Math.cos(intent.aim) * 52, y + Math.sin(intent.aim) * 52);
      this.aimLine.lineStyle(1, 0xe2cd92, .7).strokeCircle(x + Math.cos(intent.aim) * 52, y + Math.sin(intent.aim) * 52, 3);
    }
    for (const [id, p] of room.state.projectiles) {
      let v = this.shots.get(id);
      if (!v) { v = this.add.image(p.x, p.y, p.kind).setScale(1.6).setDepth(1800); this.shots.set(id, v); }
      v.setPosition(this.net.predict.value(p, 'x'), this.net.predict.value(p, 'y')).setRotation(p.angle);
    }
    for (const [id, v] of this.shots) if (!room.state.projectiles.has(id)) { v.destroy(); this.shots.delete(id); }
    this.hud(this.net);
  }
  private drawActor(id: string, actor: Player | Mob, kind: 'archer' | 'mage', aim: number): void {
    let view = this.actors.get(id);
    const x = this.net.predict.value(actor, 'x'), y = this.net.predict.value(actor, 'y');
    if (!view) {
      view = { sprite: this.add.sprite(x, y, `${kind}-1-0`).setScale(1.8).setOrigin(.5, .8), label: this.add.text(x, y - 48, '', { fontFamily: 'monospace', fontSize: '10px', color: '#e6e4c5', stroke: '#183328', strokeThickness: 3 }).setOrigin(.5), bar: this.add.graphics(), x, y };
      this.actors.set(id, view);
    }
    const alive = actor.hp > 0;
    view.sprite.setVisible(alive); view.bar.setVisible(alive); view.label.setVisible(alive);
    if (!alive) return;
    const direction = (Math.round(aim / (Math.PI / 2)) + 4) % 4;
    const moving = Math.hypot(x - view.x, y - view.y) > .12;
    if (moving) view.sprite.play(`${kind}-${direction}`, true);
    else { view.sprite.stop(); view.sprite.setTexture(`${kind}-${direction}-0`); }
    view.sprite.setPosition(x, y).setDepth(y);
    const player = kind === 'archer' ? actor as Player : undefined;
    const protectedNow = player && player.protectedUntil > this.net.room.state.elapsed;
    view.sprite.setAlpha(player && !player.connected ? .35 : protectedNow ? .65 + Math.sin(this.time.now / 90) * .2 : 1);
    view.label.setPosition(x, y - 50).setDepth(y + 1).setText(player ? `${player.name}${id === this.net.room.sessionId ? ' · YOU' : ''}` : 'HOLLOW MAGE');
    view.bar.clear().setDepth(y + 1).fillStyle(0x152c25).fillRect(x - 17, y - 39, 34, 5);
    view.bar.fillStyle(kind === 'archer' ? 0xa7c990 : 0xc59dc6).fillRect(x - 16, y - 38, 32 * actor.hp / (kind === 'archer' ? RULES.playerHealth : RULES.mobHealth), 3);
    view.x = x; view.y = y;
  }
}
