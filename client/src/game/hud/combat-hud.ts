import { chargeProgress, classMovement, equippedCombat, type Player } from '@openrpg/shared';

const icons = {
  dash: '<path d="m12 7 10 9-10 9M4 9h5M2 16h7M4 23h5"/>',
  arrow: '<path d="M7 25 25 7M16 7h9v9M7 19v6h6"/>',
  storm:
    '<path d="M16 3v26M3 16h26M7 7l18 18M7 25 25 7M13 6l3-3 3 3M26 13l3 3-3 3M13 26l3 3 3-3M6 13l-3 3 3 3"/>',
  fire: '<path d="M18 3c2 9 10 11 8 18a10 10 0 0 1-20-1c0-5 3-8 6-11-1 6 3 8 3 8s5-5 3-14Z"/>',
  sword: '<path d="m10 22 3-8L27 4l-9 15-8 3ZM5 18l9 9M4 28l6-6"/>',
  shield: '<path d="m16 3 11 4v10c0 6-11 12-11 12S5 23 5 17V7l11-4ZM16 9v13M10 15h12"/>',
};
interface Slot {
  root: HTMLElement;
  icon: HTMLElement;
  name: HTMLElement;
  time: HTMLElement;
  fill: HTMLElement;
}
export class CombatHud {
  private slots: Slot[];
  private kind = '';
  constructor(root: HTMLElement) {
    root.innerHTML = ['HOLD LEFT · RELEASE', 'RIGHT CLICK', 'Q · DODGE']
      .map(
        (key, i) =>
          `<div class="ability" id="ability-${['primary', 'special', 'dash'][i]}"><div class="ability-rune" aria-hidden="true"></div><div class="ability-body"><small>${key}</small><strong></strong><div class="ability-track"><i></i></div></div><span class="ability-time"></span></div>`,
      )
      .join('');
    this.slots = Array.from(root.querySelectorAll<HTMLElement>('.ability')).map((el) => ({
      root: el,
      icon: el.querySelector('.ability-rune')!,
      name: el.querySelector('strong')!,
      time: el.querySelector('.ability-time')!,
      fill: el.querySelector('i')!,
    }));
  }
  update(player: Player, now: number, connected: boolean): void {
    const rules = equippedCombat(player);
    const dash = classMovement(player.characterClass).dash;
    const abilities = [rules.primary, rules.special, dash];
    if (this.kind !== player.characterClass) {
      this.kind = player.characterClass;
      const symbols =
        this.kind === 'mage'
          ? [icons.fire, icons.fire]
          : this.kind === 'warrior'
            ? [icons.sword, icons.shield]
            : [icons.arrow, icons.storm];
      this.slots.forEach((slot, i) => {
        slot.name.textContent = abilities[i]!.name;
        slot.icon.innerHTML = `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${i === 2 ? icons.dash : symbols[i]}</svg>`;
      });
    }
    this.slots.forEach((slot, i) => {
      const remaining =
        i === 0 ? 0 : Math.max(0, (i === 1 ? player.nextSpecialAt : player.nextDashAt) - now);
      const stunned = player.stunnedUntil > now;
      const available = connected && player.hp > 0 && !stunned;
      const active = available && i === 1 && player.invulnerableUntil > now;
      const charging = available && i === 0 && player.chargeStartedAt >= 0;
      const label = !connected
        ? 'Offline'
        : player.hp <= 0
          ? '—'
          : stunned
            ? 'Stunned'
            : active
              ? `${((player.invulnerableUntil - now) / 1000).toFixed(1)}s ward`
              : charging
                ? 'Release'
                : remaining > 0
                  ? `${(remaining / 1000).toFixed(1)}s`
                  : 'Ready';
      if (slot.time.textContent !== label) {
        slot.time.textContent = label;
      }
      const fill =
        i === 0
          ? charging
            ? chargeProgress(now - player.chargeStartedAt, rules.primary.chargeMs)
            : 1
          : Math.max(0, 1 - remaining / (i === 1 ? rules.special.cooldownMs : dash.cooldownMs));
      slot.fill.style.transform = `scaleX(${fill})`;
      slot.root.classList.toggle('ready', available && remaining === 0 && !charging);
      slot.root.classList.toggle('active', active);
      slot.root.classList.toggle('unavailable', !available);
      slot.root.setAttribute('aria-label', `${abilities[i]!.name}: ${label}`);
    });
  }
}
