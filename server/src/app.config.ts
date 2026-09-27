import type { Adventures } from './adventure/store.js';
import { adventureRouter } from './adventure/http.js';
import {
  defineServer,
  defineRoom,
  LobbyRoom,
  ServerError,
  type Server,
  type AuthContext,
} from '@colyseus/core';
import express from 'express';
import { parseJoinOptions } from '@openrpg/shared';
import { fileURLToPath } from 'node:url';
import type { Skins } from './skins/store.js';
import { skinRouter } from './skins/http.js';
import { Village } from './rooms/Village.js';
import { Expedition } from './rooms/Expedition.js';
import type { Accounts } from './auth/accounts.js';
import { AuthError } from './auth/accounts.js';
import { authRouter } from './auth/http.js';
import { sessionToken } from './auth/session.js';
export function createGameServer(
  accounts: Accounts,
  skins: Skins,
  adventures: Adventures,
  origin: string,
  secure = false,
): Server {
  class AuthenticatedExpedition extends Expedition {
    readonly accounts = accounts;
    readonly skins = skins;
    readonly adventures = adventures;
    static override async onAuth(_token: string, options: unknown, context: AuthContext) {
      if (context.headers.get('origin') && context.headers.get('origin') !== origin) {
        throw new ServerError(403, 'Invalid origin.');
      }
      try {
        parseJoinOptions(options);
      } catch (error) {
        throw new ServerError(400, (error as Error).message);
      }
      try {
        const session = await accounts.authenticate(sessionToken(context.headers.get('cookie')));
        const { skinId, characterClass } = parseJoinOptions(options);
        if (skinId) {
          await skins.get(skinId, session.profile.id, characterClass);
        }
        return session;
      } catch (error) {
        throw new ServerError(
          error instanceof AuthError ? error.status : 503,
          error instanceof AuthError ? error.message : 'Account service unavailable.',
        );
      }
    }
  }
  class AuthenticatedVillage extends Village {
    readonly accounts = accounts;
    readonly skins = skins;
    readonly adventures = adventures;
    static override onAuth = AuthenticatedExpedition.onAuth;
  }
  return defineServer({
    rooms: {
      expedition: defineRoom(AuthenticatedExpedition).enableRealtimeListing(),
      lobby: defineRoom(LobbyRoom),
      village: defineRoom(AuthenticatedVillage),
    },
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
