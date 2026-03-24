import express, { Request, Response, NextFunction } from 'express';
import { SessionManager } from './session/session-manager';
import { TokenStore } from './auth/token';
import { createApiRouter } from './routes/api';
import { createAdminRouter } from './routes/admin';
import { createSsoRouter } from './routes/sso';
import { createStaticRouter } from './routes/static';
import { ServerConfig } from './config';
import { createLogger } from './logger';

const log = createLogger('app');

export function createApp(
  sessionManager: SessionManager,
  tokenStore: TokenStore,
  config: ServerConfig
) {
  const app = express();

  // Security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss: ws:; img-src 'self' data:; font-src 'self'"
    );
    next();
  });

  // DNS rebinding protection: validate Host header (only when a real domain is configured)
  if (config.serverUrl) {
    const expectedHost = (() => {
      try { return new URL(config.serverUrl).host; } catch { return null; }
    })();

    // Only enforce host validation when SERVER_URL points to a real domain (not localhost/IP)
    const isRealDomain = expectedHost && !expectedHost.startsWith('localhost') && !expectedHost.startsWith('127.0.0.1') && !/^\d+\.\d+\.\d+\.\d+/.test(expectedHost);

    if (isRealDomain) {
      app.use((req: Request, res: Response, next: NextFunction) => {
        const host = req.headers.host;
        if (host && host !== expectedHost && host !== `localhost:${config.port}` && host !== `127.0.0.1:${config.port}`) {
          res.status(403).json({ error: 'Invalid Host header' });
          return;
        }
        next();
      });
    }
  }

  // Middleware
  app.use(express.json());

  // Rate limiting (simple in-memory)
  const requestCounts = new Map<string, { count: number; resetAt: number }>();
  app.use((req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const entry = requestCounts.get(ip);

    if (!entry || now > entry.resetAt) {
      requestCounts.set(ip, { count: 1, resetAt: now + 60000 });
      return next();
    }

    entry.count++;
    if (entry.count > 100) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  });

  // Routes
  app.use(createApiRouter(sessionManager, tokenStore, config));
  app.use(createAdminRouter(sessionManager, tokenStore, config));
  if (config.ssoEnabled) {
    app.use(createSsoRouter(sessionManager, tokenStore, config));
    log.info('SSO/OIDC enabled', { issuer: config.ssoIssuerUrl });
  }
  app.use(createStaticRouter());

  return app;
}
