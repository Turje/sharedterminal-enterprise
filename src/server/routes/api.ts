import { Router, Request, Response } from 'express';
import { SessionManager } from '../session/session-manager';
import { TokenStore } from '../auth/token';
import { createExpressAuthMiddleware } from '../auth/middleware';
import { SharedTerminalError } from '../../shared/errors';
import { CreateSessionRequest, JoinSessionRequest } from '../../shared/types';
import { formatSessionUrlFromBase } from '../../shared/utils';
import { ServerConfig } from '../config';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

export function createApiRouter(
  sessionManager: SessionManager,
  tokenStore: TokenStore,
  config: ServerConfig
): Router {
  const router = Router();
  const authMiddleware = createExpressAuthMiddleware(tokenStore);
  const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

  // Periodically clean up expired lockouts to prevent memory leak
  setInterval(() => {
    const now = Date.now();
    for (const [ip, attempt] of loginAttempts) {
      if (attempt.lockedUntil > 0 && now > attempt.lockedUntil) {
        loginAttempts.delete(ip);
      }
    }
  }, 60_000);

  // Health check (no auth)
  router.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Create session (no auth — this is how you get the first token)
  router.post('/api/session/create', async (req: Request, res: Response) => {
    try {
      const body = req.body as CreateSessionRequest;
      if (!body.projectPath || !body.ownerName || !body.password) {
        res.status(400).json({ error: 'projectPath, ownerName, and password are required' });
        return;
      }

      const { session, token } = await sessionManager.createSession({
        projectPath: body.projectPath,
        name: body.name,
        ownerName: body.ownerName,
        password: body.password,
      });

      // Audit: session created
      session.auditLogger?.log('session.created', {
        userId: session.ownerId,
        userName: body.ownerName,
        ip: req.ip,
      });

      const url = formatSessionUrlFromBase(sessionManager.getBaseUrl(), session.id);

      res.json({
        sessionId: session.id,
        token,
        url,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Check if a session is public (no auth needed)
  router.get('/api/session/public-info', (req: Request, res: Response) => {
    try {
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
      }
      const session = sessionManager.getSession(sessionId);
      res.json({ isPublic: session.isPublic, sessionName: session.name });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Join session (no auth — password is verified in body, brute-force protected)
  router.post('/api/session/join', async (req: Request, res: Response) => {
    try {
      // Block password join when SSO is enforced (no fallback)
      if (config.ssoEnabled && !config.ssoPasswordFallback) {
        res.status(403).json({
          error: 'Password login is disabled. Please use SSO to join this session.',
          code: 'SSO_REQUIRED',
          ssoLoginUrl: '/api/auth/sso/login',
        });
        return;
      }

      const body = req.body as JoinSessionRequest;
      if (!body.sessionId || !body.name) {
        res.status(400).json({ error: 'sessionId and name are required' });
        return;
      }

      // Check if session is public (skip password)
      let isPublicSession = false;
      try {
        const session = sessionManager.getSession(body.sessionId);
        isPublicSession = session.isPublic;
      } catch {}

      if (!isPublicSession && !body.password) {
        res.status(400).json({ error: 'sessionId, password, and name are required' });
        return;
      }

      // Brute-force protection per IP (skip for public sessions)
      const ip = req.ip || 'unknown';
      if (!isPublicSession) {
        const attempt = loginAttempts.get(ip);
        if (attempt && Date.now() < attempt.lockedUntil) {
          const waitSec = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);

          // Audit: lockout
          try {
            const session = sessionManager.getSession(body.sessionId);
            session.auditLogger?.log('auth.lockout', { ip });
          } catch {}

          res.status(429).json({ error: `Too many attempts. Try again in ${waitSec}s` });
          return;
        }
      }

      try {
        let userToken: string;
        let userId: string;

        if (isPublicSession) {
          // Public session — no password needed, just generate a token
          ({ token: userToken, userId } = sessionManager.generateJoinToken(body.sessionId, body.name));
        } else {
          ({ token: userToken, userId } = await sessionManager.authenticateAndJoin(
            body.sessionId,
            body.password!,
            body.name
          ));
        }

        // Clear attempts on success
        loginAttempts.delete(ip);

        // Audit: auth success
        try {
          const session = sessionManager.getSession(body.sessionId);
          session.auditLogger?.log('auth.success', { userId, userName: body.name, ip });
        } catch {}

        const url = formatSessionUrlFromBase(sessionManager.getBaseUrl(), body.sessionId);

        // Get session name for browser tab title
        let sessionName = '';
        try {
          const session = sessionManager.getSession(body.sessionId);
          sessionName = session.name;
        } catch {}

        res.json({
          sessionId: body.sessionId,
          sessionName,
          token: userToken,
          url,
          role: 'editor',
        });
      } catch (authErr) {
        // Track failed attempts (only for non-public sessions)
        if (!isPublicSession) {
          const current = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
          current.count++;
          if (current.count >= MAX_LOGIN_ATTEMPTS) {
            current.lockedUntil = Date.now() + LOCKOUT_MS;
            current.count = 0;
          }
          loginAttempts.set(ip, current);
        }

        // Audit: auth failure
        try {
          const session = sessionManager.getSession(body.sessionId);
          session.auditLogger?.log('auth.failure', { userName: body.name, ip });
        } catch {}

        throw authErr;
      }
    } catch (err) {
      handleError(res, err);
    }
  });

  // Stop session (requires auth + owner role)
  router.post('/api/session/stop', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { sessionId, role } = req.tokenPayload!;
      if (role !== 'owner') {
        res.status(403).json({ error: 'Only the owner can stop a session' });
        return;
      }

      // Audit: session stopped
      try {
        const session = sessionManager.getSession(sessionId);
        session.auditLogger?.log('session.stopped', {
          userId: req.tokenPayload!.userId,
          ip: req.ip,
        });
      } catch {}

      await sessionManager.stopSession(sessionId);
      res.json({ status: 'stopped' });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Session status (requires auth)
  router.get('/api/session/status', authMiddleware, (req: Request, res: Response) => {
    try {
      const { sessionId } = req.tokenPayload!;
      const session = sessionManager.getSession(sessionId);
      res.json({ session: session.toInfo() });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Kick user (requires auth + owner role)
  router.post('/api/session/kick', authMiddleware, (req: Request, res: Response) => {
    try {
      const { sessionId, role, userId } = req.tokenPayload!;
      if (role !== 'owner') {
        res.status(403).json({ error: 'Only the owner can kick users' });
        return;
      }

      const { targetUserId } = req.body as { targetUserId: string };
      if (!targetUserId) {
        res.status(400).json({ error: 'targetUserId is required' });
        return;
      }

      const session = sessionManager.getSession(sessionId);
      session.removeUser(targetUserId);
      session.auditLogger?.log('user.kicked', {
        userId,
        data: { targetUserId },
      });

      res.json({ status: 'kicked' });
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof SharedTerminalError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
  } else {
    console.error('[api] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
