import { Adventures } from './adventure/store.js';
import { adventureRouter } from './adventure/http.js';
import { defineServer, defineRoom, LobbyRoom, ServerError, type Server, type AuthContext } from '@colyseus/core';
import express from 'express';
import { parseJoinOptions } from '@openrpg/shared';
import { fileURLToPath } from 'node:url';
import { Skins } from './skins/store.js';
import { skinRouter } from './skins/http.js';
import { Expedition } from './rooms/Expedition.js';
import { Accounts, AuthError } from './auth/accounts.js';
import { authRouter, sessionToken } from './auth/http.js';
export function createGameServer(accounts: Accounts, skins: Skins, adventures: Adventures, origin: string, secure = false): Server {
  class AuthenticatedExpedition extends Expedition {
    readonly accounts = accounts;
    readonly skins = skins;
    readonly adventures = adventures;
    static override async onAuth(_token: string, options: unknown, context: AuthContext) {
      if (context.headers.get('origin') && context.headers.get('origin') !== origin) throw new ServerError(403, 'Invalid origin.');
      try { parseJoinOptions(options); }
      catch (error) { throw new ServerError(400, (error as Error).message); }
      try {
        const session = await accounts.authenticate(sessionToken(context.headers.get('cookie')));
        const { skinId, characterClass } = parseJoinOptions(options);
        if (skinId) await skins.get(skinId, session.profile.id, characterClass);
        return session;
      }
      catch (error) { throw new ServerError(error instanceof AuthError ? error.status : 503, error instanceof AuthError ? error.message : 'Account service unavailable.'); }
    }
  }
  return defineServer({
    rooms: { expedition: defineRoom(AuthenticatedExpedition).enableRealtimeListing(), lobby: defineRoom(LobbyRoom) },
    express: (app) => {
      app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 0));
      app.use('/api/auth', authRouter(accounts, origin, secure));
      app.use('/api/adventure', adventureRouter(accounts, adventures, origin));
      app.use('/api/skins', skinRouter(accounts, skins, origin));
      app.get('/health', (_req, res) => res.json({ ok: true }));
      app.use(express.static(fileURLToPath(new URL('../../client/dist/', import.meta.url))));
    },
  });
}
