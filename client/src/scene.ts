import { audio } from './audio/audio';
import { CombatAudio, soundClass } from './audio/game-audio';
import Phaser from 'phaser';
import { ChargeView } from './charge-view';
import { EquipmentView } from './equipment-view';
import { LootView } from './loot-view';
import { COMBAT, RULES, WORLD, enemyRole, enemyRules, ENEMY_THEMES, type Player, type Mob } from '@openrpg/shared';
import { createTextures } from './art';
import { drawWorld } from './world-art';
import { createEnemyTextures } from './enemy-art';
import { RoomSkins } from './room-skins';
import { CombatView } from './combat-view';
import { Controls } from './controls';
import { GameNetwork } from './network';
interface ActorView { equipment?: EquipmentView; sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; bar: Phaser.GameObjects.Graphics; x: number; y: number }
export class ExpeditionScene extends Phaser.Scene {
  private sounds = new CombatAudio((sound, volume) => audio.play(sound, volume));
  private silence = (): void => { audio.stopCharge(); this.sounds.reset(); };
  private controls!: Controls;
  private skins!: RoomSkins;
  private actors = new Map<string, ActorView>();
  private combat!: CombatView;
  private charge!: ChargeView;
  private loot!: LootView;
  private aimLine!: Phaser.GameObjects.Graphics;
  private following = false;
  constructor(private net: GameNetwork, private hud: (net: GameNetwork) => void) { super('expedition'); }
  create(): void {
    const map = this.net.map;
    const fight = this.net.room.state.mode === 'fight';
    createTextures(this); if (!fight) createEnemyTextures(this, map.id);
    drawWorld(this, map, fight); this.skins = new RoomSkins(this);
    this.controls = new Controls(this, () => { if (this.net.connected) this.net.room.send('potion'); });
    this.combat = new CombatView(this, this.net);
    this.charge = new ChargeView(this, this.net);
    this.loot = new LootView(this, this.net.room.state, this.net.room.sessionId);
    this.aimLine = this.add.graphics().setDepth(2000);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height).setZoom(1.3);
    this.cameras.main.centerOn(map.spawns[0]!.x, map.spawns[0]!.y);
    this.net.room.onDrop(this.controls.clear);
    this.net.room.onDrop(this.silence);
    window.addEventListener('blur', this.silence); document.addEventListener('visibilitychange', this.silence);
    this.net.room.onReconnect(this.controls.clear);
    this.events.once('shutdown', () => {
      this.net.room.onDrop.remove(this.controls.clear); this.net.room.onReconnect.remove(this.controls.clear);
      this.net.room.onDrop.remove(this.silence); this.silence();
      window.removeEventListener('blur', this.silence); document.removeEventListener('visibilitychange', this.silence);
      this.controls.dispose();
    });
  }
  update(time: number): void {
    const room = this.net.room;
    const self = room.state.players.get(room.sessionId);
    const position = self ? { x: this.net.predict.value(self, 'x'), y: this.net.predict.value(self, 'y') } : this.net.map.spawns[0]!;
    if (!self || self.hp <= 0 || !this.net.connected || room.state.outcome === 'failed' || room.state.saveStatus === 'error') this.controls.clear();
    const intent = this.controls.sample(position);
    if (this.net.frame(time, intent)) this.controls.consume();
    const live = new Set<string>();
    for (const [id, p] of room.state.players) { live.add(id); this.drawActor(id, p, 'player', id === room.sessionId ? intent.aim : p.aim); }
    for (const [id, m] of room.state.mobs) { live.add(id); this.drawActor(id, m, 'enemy', m.aim); }
    for (const [id, v] of this.actors) if (!live.has(id)) { v.equipment?.destroy(); v.sprite.destroy(); v.label.destroy(); v.bar.destroy(); this.actors.delete(id); }
    this.skins.retain(new Set([...room.state.players.values()].map(player => player.skinId)));
    const localView = this.actors.get(room.sessionId);
    if (localView && !this.following) { this.cameras.main.startFollow(localView.sprite, true, 1, 1); this.following = true; }
    this.aimLine.clear();
    if (localView && self && self.hp > 0) {
      const x = localView.sprite.x, y = localView.sprite.y;
      const reach = self.characterClass === 'warrior' ? COMBAT.swordReach : 52;
      this.aimLine.lineStyle(1, 0xe2cd92, .4).lineBetween(x + Math.cos(intent.aim) * 18, y + Math.sin(intent.aim) * 18, x + Math.cos(intent.aim) * reach, y + Math.sin(intent.aim) * reach);
      this.aimLine.lineStyle(1, 0xe2cd92, .7).strokeCircle(x + Math.cos(intent.aim) * reach, y + Math.sin(intent.aim) * reach, 3);
    }
    this.combat.draw(); this.loot.draw(); this.charge.draw(intent);
    audio.charge(this.charge.progress, soundClass(self?.characterClass ?? 'archer'));
    this.sounds.update(room.state, room.sessionId, this.net.connected && audio.audible);
    this.hud(this.net);
  }
  get chargeProgress(): number | null { return this.charge?.progress ?? null; }
  actorEquipment(id: string): string[] { return this.actors.get(id)?.equipment?.textures ?? []; }
  actorTexture(id: string): string | undefined { return this.actors.get(id)?.sprite.texture.key; }
  private drawActor(id: string, actor: Player | Mob, kind: 'player' | 'enemy', aim: number): void {
    const mob = kind === 'enemy' ? actor as Mob : undefined;
    const texture = mob ? `enemy-${enemyRole(mob.role)}` : this.skins.key(actor as Player);
    const boss = mob?.role === 'boss', height = boss ? 85 : 50;
    let view = this.actors.get(id);
    const x = this.net.predict.value(actor, 'x'), y = this.net.predict.value(actor, 'y');
    if (!view) {
      view = { sprite: this.add.sprite(x, y, `${texture}-1-0`).setScale(boss ? 2.5 : mob ? 1.4 : 1.8).setOrigin(.5, .8), label: this.add.text(x, y - 48, '', { fontFamily: 'monospace', fontSize: '10px', color: '#e6e4c5', stroke: '#183328', strokeThickness: 3 }).setOrigin(.5), bar: this.add.graphics(), x, y };
      if (kind === 'player') view.equipment = new EquipmentView(this);
      this.actors.set(id, view);
    }
    const alive = actor.hp > 0;
    view.sprite.setVisible(alive); view.bar.setVisible(alive); view.label.setVisible(alive);
    if (!alive) { view.equipment?.draw(actor as Player, view.sprite); return; }
    const direction = (Math.round(aim / (Math.PI / 2)) + 4) % 4;
    const moving = Math.hypot(x - view.x, y - view.y) > .12;
    if (moving) view.sprite.play(`${texture}-${direction}`, true);
    else { view.sprite.stop(); view.sprite.setTexture(`${texture}-${direction}-0`); }
    view.sprite.setPosition(x, y).setDepth(y);
    const player = kind !== 'enemy' ? actor as Player : undefined;
    const opponent = !!player && this.net.room.state.mode === 'fight' && id !== this.net.room.sessionId;
    const protectedNow = player && player.protectedUntil > this.net.room.state.elapsed;
    view.sprite.setAlpha(player && !player.connected ? .35 : protectedNow ? .65 + Math.sin(this.time.now / 90) * .2 : 1);
    view.label.setPosition(x, y - height).setDepth(y + 1).setColor(opponent ? '#e5a18e' : '#e6e4c5').setText(player ? `${player.name}${id === this.net.room.sessionId ? ' · YOU' : opponent ? ' · RIVAL' : ''}` : ENEMY_THEMES[this.net.map.id].names[enemyRole(mob!.role)].toUpperCase());
    const width = boss ? 64 : 34;
    view.bar.clear().setDepth(y + 1).fillStyle(0x152c25).fillRect(x - width / 2, y - height + 11, width, 5);
    view.bar.fillStyle(opponent ? 0xd98b78 : kind !== 'enemy' ? 0xa7c990 : 0xc59dc6).fillRect(x - width / 2 + 1, y - height + 12, (width - 2) * actor.hp / (kind !== 'enemy' ? RULES.playerHealth : enemyRules(mob!.role).health), 3);
    if (player) view.equipment?.draw(player, view.sprite);
    view.x = x; view.y = y;
  }
}
