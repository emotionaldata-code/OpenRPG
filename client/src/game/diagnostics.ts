import type { VillageHub } from '../village/hub';
import type Phaser from 'phaser';
import type { GameNetwork, GameRoom } from './network';
import type { ExpeditionScene } from './scene';
import { audio } from '../audio/audio';

export function installDiagnostics(
  current: () => { network?: GameNetwork; game?: Phaser.Game; gameRoom?: GameRoom },
  village?: VillageHub,
): void {
  if (new URL(location.href).searchParams.has('debug')) {
    void import('@colyseus/sdk/debug');
  }
  // Read-only telemetry plus a transport-drop hook for reproducible local acceptance tests.
  Object.defineProperty(window, '__openrpg', {
    get: () => {
      const { network, game, gameRoom } = current();
      return {
        village: () => village?.snapshot() ?? null,
        dropVillage: () => village?.drop(),
        audio: () => ({ ...audio.diagnostics, enabled: audio.isEnabled, audible: audio.audible }),
        snapshot: () =>
          network
            ? {
                roomId: network.room.roomId,
                sessionId: network.room.sessionId,
                connected: network.connected,
                state: network.room.state.toJSON(),
                diagnostics: network.diagnostics(),
                chargeProgress:
                  (game?.scene.getScene('expedition') as ExpeditionScene | undefined)
                    ?.chargeProgress ?? null,
                rendered: Object.fromEntries(
                  [...network.room.state.players].map(([id, p]) => [
                    id,
                    {
                      x: network!.predict.value(p, 'x'),
                      y: network!.predict.value(p, 'y'),
                      equipment: (
                        game?.scene.getScene('expedition') as ExpeditionScene | undefined
                      )?.actorEquipment(id),
                      texture: (
                        game?.scene.getScene('expedition') as ExpeditionScene | undefined
                      )?.actorTexture(id),
                    },
                  ]),
                ),
              }
            : null,
        drop: () => gameRoom?.connection.close(),
        screenPoint: (x: number, y: number) => {
          const camera = game?.scene.getScene('expedition').cameras.main;
          const point = camera?.getViewMatrix().transformPoint(x, y);
          return point ? { x: point.x, y: point.y + 68 } : null;
        },
      };
    },
  });
}
