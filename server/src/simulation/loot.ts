import {
  LOOT,
  LootDrop,
  enemyLoot,
  getMap,
  terrainHit,
  item,
  moveBody,
  type WorldState,
  type Mob,
  type Reward,
} from '@openrpg/shared';
/** Personal drops: proximity is checked against authoritative positions, never client claims. */
export class Loot {
  private nextId = 0;
  private map;
  constructor(
    private state: WorldState,
    private collected: (playerId: string, dropId: string, reward: Reward) => void,
  ) {
    this.map = getMap(state.mapId);
  }
  spawn(mob: Mob): void {
    for (const [owner, player] of this.state.players) {
      if (!player.connected || player.hp <= 0) {
        continue;
      }
      const reward = enemyLoot(mob.role, player.characterClass);
      const entries = [
        ...reward.items.map((itemId) => ({ itemId, quantity: 1 })),
        { itemId: 'potion', quantity: 1 },
        { itemId: 'coins', quantity: mob.role === 'boss' ? 25 : 5 },
      ];
      for (const [index, entry] of entries.entries()) {
        while (this.state.drops.size >= LOOT.maxDrops) {
          this.state.drops.delete(this.state.drops.keys().next().value!);
        }
        const position = { x: mob.x, y: mob.y };
        moveBody(position, (index - 1) * 24, index === 1 ? 12 : -8, 4, this.map.obstacles);
        this.state.drops.set(
          String(this.nextId++),
          new LootDrop({
            owner,
            ...entry,
            ...position,
            availableAt: this.state.elapsed + LOOT.graceMs,
            expiresAt: this.state.elapsed + LOOT.lifetimeMs,
          }),
        );
      }
    }
  }
  step(): void {
    for (const [id, drop] of this.state.drops) {
      const player = this.state.players.get(drop.owner);
      if (!player || this.state.elapsed >= drop.expiresAt) {
        this.state.drops.delete(id);
        continue;
      }
      if (
        !player.connected ||
        player.hp <= 0 ||
        this.state.elapsed < drop.availableAt ||
        this.state.outcome === 'failed'
      ) {
        continue;
      }
      if (
        Math.hypot(player.x - drop.x, player.y - drop.y) > LOOT.pickupRadius ||
        terrainHit(player, drop, 0, this.map.obstacles) !== null
      ) {
        continue;
      }
      const reward: Reward = {
        items: item(drop.itemId) ? [drop.itemId] : [],
        potions: drop.itemId === 'potion' ? drop.quantity : 0,
        coins: drop.itemId === 'coins' ? drop.quantity : 0,
      };
      this.collected(drop.owner, id, reward);
      this.state.drops.delete(id);
      player.lootNotice =
        drop.itemId === 'coins'
          ? `+${drop.quantity} coins`
          : drop.itemId === 'potion'
            ? '+1 stored health potion'
            : `+1 ${item(drop.itemId)!.name}`;
      player.lootAt = this.state.elapsed;
    }
  }
  removePlayer(id: string): void {
    for (const [key, drop] of this.state.drops) {
      if (drop.owner === id) {
        this.state.drops.delete(key);
      }
    }
  }
}
