import {
  RULES,
  ENEMY_THEMES,
  getMap,
  enemyRules,
  type Player,
  type WorldState,
} from '@openrpg/shared';
import type { GameNetwork } from '../network';
import type { CombatHud } from './combat-hud';
import { element } from '../../ui/dom';

export function updateHud(net: GameNetwork, combatHud: CombatHud, leaveError: string): void {
  const p = net.room.state.players.get(net.room.sessionId);
  if (!p) {
    return;
  }
  combatHud.update(p, net.serverTime, net.connected);
  element('health-text').textContent = `${p.hp} / ${RULES.playerHealth}`;
  element('health-fill').style.width = `${p.hp}%`;
  element('party').textContent = [...net.room.state.players.values()]
    .map(
      (p) =>
        `${p.connected ? '●' : '○'} ${p.name} · ${p.hp > 0 ? `${p.hp} HP` : net.room.state.mode === 'story' ? 'fallen' : 'returning'}`,
    )
    .join('\n');
  const state = net.room.state,
    story = state.mode === 'story';
  element('combat-status').textContent = combatStatus(p, state);
  element('potion-hud').textContent =
    `R · ${p.potions} health potion${p.potions === 1 ? '' : 's'} · +50 HP${p.nextPotionAt > net.serverTime ? ' · cooling down' : ''}`;
  element('loot-notice').hidden =
    !p.lootNotice || (state.outcome === 'active' && state.elapsed - p.lootAt > 5000);
  element('loot-notice').textContent =
    `${p.lootNotice} · ${state.saveStatus === 'saved' ? 'Saved to your collection' : state.saveStatus === 'error' ? 'Save interrupted; retrying…' : 'Saving…'}`;
  element('expedition-result').classList.toggle('victory', state.outcome === 'complete');
  element('expedition-result').hidden =
    state.outcome === 'active' && !(story && p.hp <= 0) && state.saveStatus !== 'error';
  element('expedition-result').textContent = resultMessage(p, state);
  element('recovery').hidden = net.connected && !leaveError;
  if (leaveError) {
    element('recovery').textContent = leaveError;
  }
  if (!net.connected) {
    element('recovery').textContent = 'Connection lost · finding your way back (up to 15s)…';
  }
  if (import.meta.env.DEV) {
    const d = net.diagnostics();
    element('diagnostics').textContent =
      `${Math.round(d.rtt)}ms RTT · ${d.drift.toFixed(1)}px drift`;
  }
}

function secondsUntil(at: number, now: number): number {
  return Math.max(0, Math.ceil((at - now) / 1000));
}

function combatStatus(player: Player, state: WorldState): string {
  const story = state.mode === 'story';
  let message = `${player.kills} ${state.mode === 'fight' ? 'players' : 'enemies'} defeated`;
  if (player.hp <= 0) {
    message = story
      ? 'You have fallen · no respawn in Story'
      : `Returning to camp in ${secondsUntil(player.respawnAt, state.elapsed)}s`;
  } else if (player.protectedUntil > state.elapsed) {
    message += ' · Protected';
  }
  if (state.mode === 'fight' && state.players.size < 2) {
    message += ' · Invite an opponent to fight';
  }
  const boss = [...state.mobs.values()].find((mob) => mob.role === 'boss');
  if (boss) {
    let status = story ? 'defeated' : `returns in ${secondsUntil(boss.respawnAt, state.elapsed)}s`;
    if (boss.hp > 0) {
      status = `${boss.hp}/${enemyRules('boss', getMap(state.mapId).id).health} HP${boss.enraged ? ' · ENRAGED' : ''}`;
    }
    message += ` · ${ENEMY_THEMES[getMap(state.mapId).id].names.boss}: ${status}`;
  }
  return message;
}

function resultMessage(player: Player, state: WorldState): string {
  if (state.saveStatus === 'error') {
    return 'Storage is unavailable. The expedition is paused while your rewards are saved.';
  }
  if (state.outcome === 'complete') {
    const progress =
      player.hp > 0 ? 'Story progress earned.' : 'You fell before the realm was cleared.';
    const rewards =
      state.saveStatus === 'saved'
        ? 'Walk over your remaining loot, then return to camp.'
        : 'Saving your rewards…';
    return `Realm cleared. ${progress} ${rewards}`;
  }
  if (state.outcome === 'failed') {
    return 'Your party has fallen. Your collected gear is safe. Leave to try again.';
  }
  return 'You have fallen. Your party can continue. Leave when you are ready.';
}
