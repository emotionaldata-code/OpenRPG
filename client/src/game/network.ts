import {
  Client,
  Predict,
  CloseCode,
  type Room,
  type InputHandle,
  type SimReconciler,
} from '@colyseus/sdk';
import {
  MoveInput,
  moveFighter,
  movementState,
  type FighterMovement,
  type Point,
  RULES,
  getMap,
  type GameMap,
  type WorldState,
  type Player,
  type Intent,
} from '@openrpg/shared';
export type GameRoom = Room<WorldState>;
export const client = new Client(
  import.meta.env.VITE_SERVER_URL ??
    (import.meta.env.PROD
      ? location.origin
      : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`),
);
export class GameNetwork {
  readonly map: GameMap;
  readonly predict: Predict<WorldState>;
  readonly input: InputHandle<MoveInput>;
  private local?: SimReconciler<Intent, { x: number; y: number }, FighterMovement>;
  private generations = new Map<object, string>();
  connected = true;
  private started = false;
  start(): void {
    this.started = true;
    if (this.connected) {
      this.room.send('ready');
    }
  }
  private observedElapsed = -1;
  private observedAt = 0;
  get serverTime(): number {
    return (
      this.room.state.elapsed +
      (this.connected ? Math.min(RULES.patchMs * 2, performance.now() - this.observedAt) : 0)
    );
  }
  constructor(readonly room: GameRoom) {
    this.map = getMap(room.state.mapId);
    this.input = room.input({ type: MoveInput });
    this.predict = Predict.get(room, { mode: 'lerp', delay: RULES.interpolationMs, snap: 70 });
    this.predict.attachAll('players', { fields: ['x', 'y'], mode: 'lerp', snap: 70 });
    this.predict.attachAll('mobs', { fields: ['x', 'y'], mode: 'lerp', snap: 70 });
    this.predict.attachAll('projectiles', { fields: ['x', 'y'], mode: 'lerp' });
    window.addEventListener('offline', this.onOffline);
    room.onDrop(this.onDrop);
    room.onReconnect(this.onReconnect);
  }
  // The SDK offline handler can skip a connection while closing several rooms.
  private onOffline = (): void => {
    if (this.connected) {
      this.room.connection.close(CloseCode.MAY_TRY_RECONNECT);
    }
  };
  private onDrop = (): void => {
    this.connected = false;
  };
  private onReconnect = (): void => {
    this.connected = true;
    this.local?.reset();
    if (this.started) {
      this.start();
    }
  };
  frame(now: number, intent: Intent): boolean {
    if (this.observedElapsed !== this.room.state.elapsed) {
      this.observedElapsed = this.room.state.elapsed;
      this.observedAt = performance.now();
    }
    const self = this.room.state.players.get(this.room.sessionId);
    if (self && !this.local) {
      this.local = this.predict.sim({
        world: movementState(self),
        adopt: (p) => Object.assign(p, movementState(self)),
        // Timers participate in replay, but only positions affect smoothing and drift.
        pose: (p) => ({ x: p.x, y: p.y }),
        input: this.input,
        step: (ctx, p, cmd) => {
          if (this.room.state.outcome !== 'failed' && this.room.state.saveStatus !== 'error') {
            moveFighter(p, cmd, ctx.dt, this.map.obstacles);
          }
        },
        smoothMs: 65,
        snap: 70,
        warnOnDivergence: import.meta.env.DEV ? 8 : undefined,
      });
    }
    // Explicit generations snap even a respawn close to the death position.
    for (const collection of [this.room.state.players, this.room.state.mobs]) {
      for (const entity of collection.values()) {
        const signature = `${entity.generation}:${entity.hp > 0}`;
        const previous = this.generations.get(entity);
        if (previous !== undefined && previous !== signature) {
          if (entity === self) {
            this.local?.reset();
          } else {
            this.predict.detach(entity);
            this.predict.attach(entity, { fields: ['x', 'y'], mode: 'lerp', snap: 70 });
          }
        }
        this.generations.set(entity, signature);
      }
    }
    const current = new Set<object>([
      ...this.room.state.players.values(),
      ...this.room.state.mobs.values(),
    ]);
    for (const entity of this.generations.keys()) {
      if (!current.has(entity)) {
        this.generations.delete(entity);
      }
    }
    const steps = this.predict.tick(now);
    if (!this.connected || !this.started || !self?.connected) {
      return false;
    }
    for (let i = 0; i < steps; i++) {
      Object.assign(this.input.data, intent);
      this.input.data.dash = i === 0 && intent.dash === true;
      this.input.send();
    }
    return steps > 0;
  }
  position(entity: Point, axis: 'x' | 'y'): number {
    return this.local && entity === this.room.state.players.get(this.room.sessionId)
      ? this.local.value(axis)
      : this.predict.value(entity, axis);
  }
  movement(player: Player): FighterMovement {
    return player === this.room.state.players.get(this.room.sessionId)
      ? (this.local?.world ?? player)
      : player;
  }
  diagnostics(): { rtt: number; drift: number; pending: number; x: number; y: number } {
    return {
      rtt: this.room.clock.smoothedRtt(),
      drift: this.local?.drift.ema ?? 0,
      pending: this.input.pendingCount,
      x: this.local?.world.x ?? 0,
      y: this.local?.world.y ?? 0,
    };
  }
  dispose(): void {
    window.removeEventListener('offline', this.onOffline);
    this.room.onDrop.remove(this.onDrop);
    this.room.onReconnect.remove(this.onReconnect);
    this.predict.dispose();
    this.generations.clear();
  }
}
