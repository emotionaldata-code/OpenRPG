import { Predict, type Room, type Reconciler } from '@colyseus/sdk';
import {
  MoveInput,
  movePlayer,
  RULES,
  VILLAGE_WALLS,
  type VillageState,
  type Villager,
  type Intent,
} from '@openrpg/shared';

export class VillageNetwork {
  readonly input;
  readonly predict;
  connected = true;
  private local?: Reconciler<Villager, Intent>;
  constructor(readonly room: Room<VillageState>) {
    this.input = room.input({ type: MoveInput });
    this.predict = Predict.get(room, { mode: 'lerp', delay: RULES.interpolationMs, snap: 70 });
    this.predict.attachAll('players', { fields: ['x', 'y'], mode: 'lerp', snap: 70 });
    room.onDrop(this.dropped);
    room.onReconnect(this.recovered);
  }
  private dropped = (): void => {
    this.connected = false;
  };
  private recovered = (): void => {
    this.connected = true;
    this.local?.reset();
  };
  frame(time: number, intent: Intent): void {
    const self = this.room.state.players.get(this.room.sessionId);
    if (self && !this.local) {
      this.local = this.predict.reconciler(self, {
        fields: ['x', 'y', 'aim', 'connected', 'activity', 'characterClass'],
        input: this.input,
        step: (ctx, player, command) => {
          if (!player.activity) {
            movePlayer(player, command, ctx.dt, VILLAGE_WALLS);
          }
        },
        smoothMs: 65,
        snap: 70,
      });
    }
    const steps = this.predict.tick(time);
    if (!this.connected) {
      return;
    }
    for (let i = 0; i < steps; i++) {
      Object.assign(this.input.data, intent);
      this.input.send();
    }
  }
  dispose(): void {
    this.connected = false;
    this.room.onDrop.remove(this.dropped);
    this.room.onReconnect.remove(this.recovered);
    this.predict.dispose();
  }
}
