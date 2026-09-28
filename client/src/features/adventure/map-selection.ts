import {
  MAP_IDS,
  BESTIARY,
  MAPS,
  ENEMY_THEMES,
  ENCOUNTERS,
  EXPEDITION_MODES,
  mapUnlocked,
  type ExpeditionMode,
  type AdventureProfile,
  type MapId,
} from '@openrpg/shared';
import { paintPreview } from '../../art/world-art';

export class MapSelection {
  selected: MapId = 'desert';
  mode: ExpeditionMode = 'testing';
  private completedMaps = 0;
  constructor() {
    const container = document.getElementById('map-options')!;
    for (const id of MAP_IDS) {
      const map = MAPS[id];
      if (map.stage === 1) {
        const heading = document.createElement('h3');
        heading.className = 'biome-heading';
        heading.textContent = map.biome.toUpperCase();
        container.append(heading);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `map-${id}`;
      button.className = 'destination';
      button.setAttribute('aria-label', map.subtitle);
      button.style.setProperty('--destination-accent', map.palette.accent);
      const thumbnail = document.createElement('canvas');
      thumbnail.setAttribute('aria-hidden', 'true');
      paintPreview(thumbnail, map);
      const title = document.createElement('strong');
      title.textContent = map.stage === 5 ? 'BOSS' : `${map.stage} · ${map.name}`;
      button.append(thumbnail, title);
      button.onclick = () => this.select(id);
      container.append(button);
    }
    this.select('desert');
  }
  setMode(mode: ExpeditionMode): void {
    this.mode = mode;
    this.refresh();
  }
  setProfile(profile: AdventureProfile | null): void {
    this.completedMaps = profile?.completedMaps ?? 0;
    this.refresh();
  }
  private refresh(): void {
    for (const id of MAP_IDS) {
      const locked = this.mode === 'story' && !mapUnlocked(id, this.completedMaps);
      const button = document.getElementById(`map-${id}`) as HTMLButtonElement;
      button.disabled = locked;
      button.classList.toggle('locked', locked);
      const canvas = button.querySelector('canvas')!;
      if (canvas.dataset.mode !== this.mode) {
        paintPreview(canvas, MAPS[id], this.mode !== 'fight');
        canvas.dataset.mode = this.mode;
      }
      button.setAttribute(
        'aria-label',
        `${MAPS[id].subtitle}${locked ? ' — finish the previous story map to unlock' : ''}`,
      );
    }
    if (this.mode === 'story' && !mapUnlocked(this.selected, this.completedMaps)) {
      this.selected = MAP_IDS[Math.min(this.completedMaps, MAP_IDS.length - 1)]!;
    }
    document.getElementById('lives-label')!.textContent = this.mode === 'story' ? '01' : '∞';
    this.select(this.selected);
  }
  private select(id: MapId): void {
    this.selected = id;
    const map = MAPS[id];
    for (const key of MAP_IDS) {
      document.getElementById(`map-${key}`)!.setAttribute('aria-pressed', String(key === id));
    }
    paintPreview(
      document.getElementById('preview') as HTMLCanvasElement,
      map,
      this.mode !== 'fight',
    );
    document.getElementById('preview')!.setAttribute('aria-label', `${map.subtitle} map preview`);
    document.getElementById('map-title')!.textContent = map.name;
    document.getElementById('map-subtitle')!.textContent =
      this.mode === 'fight'
        ? map.subtitle
        : `${map.subtitle} · Biome ${ENCOUNTERS[id].tier}/6 · Stage ${map.stage}/5`;
    document.getElementById('map-description')!.textContent =
      this.mode === 'fight'
        ? `Duel in ${map.name}. Use the terrain for cover and challenge the other adventurers.`
        : `${map.description} ${ENCOUNTERS[id].tactic}`;
    document.getElementById('map-enemies')!.textContent =
      this.mode === 'fight'
        ? 'Players only · No monsters · Unlimited respawns'
        : map.stage === 5
          ? ENEMY_THEMES[id].names.boss
          : `${map.enemies.length} creatures · ${BESTIARY[map.biome]
              .slice(0, map.stage)
              .map((m) => m.name)
              .join(' · ')}`;
    document.getElementById('destination-note')!.textContent =
      `${EXPEDITION_MODES[this.mode]}: ${map.name}. Joining a friend uses their mode and destination.`;
  }
}
