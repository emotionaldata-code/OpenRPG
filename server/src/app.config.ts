import { defineServer, defineRoom, LobbyRoom, createRouter, createEndpoint } from 'colyseus';
import { Expedition } from './rooms/Expedition.js';
export function createGameServer() {
  return defineServer({
    rooms: { expedition: defineRoom(Expedition).enableRealtimeListing(), lobby: defineRoom(LobbyRoom) },
    routes: createRouter({ health: createEndpoint('/health', { method: 'GET' }, async () => ({ ok: true })) }),
  });
}
