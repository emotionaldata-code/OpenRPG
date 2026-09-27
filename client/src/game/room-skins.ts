import type Phaser from 'phaser';
import { SKIN, parseSkin, type Player, type Skin } from '@openrpg/shared';
import { addSkinTextures } from '../art/skin-art';
import { skinRequest } from '../features/skins/skin-api';

/** Per-room texture cache: one HTTP load per skin, never artwork in simulation patches. */
export class RoomSkins {
  private entries = new Map<string, { ready: boolean }>();
  private alive = true;
  constructor(private scene: Phaser.Scene) {
    const dispose = (): void => {
      this.alive = false;
    };
    scene.events.once('shutdown', dispose);
    scene.events.once('destroy', dispose);
  }
  key(player: Pick<Player, 'skinId' | 'characterClass'>): string {
    const id = player.skinId;
    if (!id) {
      return player.characterClass;
    }
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { ready: false };
      this.entries.set(id, entry);
      const current = entry;
      void skinRequest<Skin>(`/${id}`)
        .then((raw) => {
          const skin = parseSkin(raw);
          if (
            !this.alive ||
            this.entries.get(id) !== current ||
            skin.characterClass !== player.characterClass
          ) {
            return;
          }
          addSkinTextures(this.scene, `skin-${id}`, skin);
          current.ready = true;
        })
        .catch(() => {
          /* Original class art remains usable if a skin cannot load. */
        });
    }
    return entry.ready ? `skin-${id}` : player.characterClass;
  }
  retain(ids: Set<string>): void {
    for (const [id, entry] of this.entries) {
      if (!ids.has(id)) {
        this.entries.delete(id);
        if (!entry.ready) {
          continue;
        }
        for (let d = 0; d < SKIN.directions; d++) {
          this.scene.anims.remove(`skin-${id}-${d}`);
          for (let f = 0; f < SKIN.framesPerDirection; f++) {
            this.scene.textures.remove(`skin-${id}-${d}-${f}`);
          }
        }
      }
    }
  }
}
