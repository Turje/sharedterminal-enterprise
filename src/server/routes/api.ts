import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { SessionManager } from '../session/session-manager';
import { TokenStore } from '../auth/token';
import { createExpressAuthMiddleware } from '../auth/middleware';
import { SharedTerminalError } from '../../shared/errors';
import { CreateSessionRequest, JoinSessionRequest } from '../../shared/types';
import { formatSessionUrlFromBase } from '../../shared/utils';
import { ServerConfig } from '../config';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEMO_CREATE_LIMIT = 3;
const DEMO_CREATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export function createApiRouter(
  sessionManager: SessionManager,
  tokenStore: TokenStore,
  config: ServerConfig
): Router {
  const router = Router();
  const authMiddleware = createExpressAuthMiddleware(tokenStore);
  const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
  const teamSessions = new Map<string, string>(); // team name → sessionId
  const demoCreateAttempts = new Map<string, number[]>(); // IP → timestamps

  // Periodically clean up expired lockouts and stale demo data
  setInterval(() => {
    const now = Date.now();
    for (const [ip, attempt] of loginAttempts) {
      if (attempt.lockedUntil > 0 && now > attempt.lockedUntil) {
        loginAttempts.delete(ip);
      }
    }
    // Clean demo rate-limit entries older than the window
    for (const [ip, timestamps] of demoCreateAttempts) {
      const valid = timestamps.filter((t) => now - t < DEMO_CREATE_WINDOW_MS);
      if (valid.length === 0) demoCreateAttempts.delete(ip);
      else demoCreateAttempts.set(ip, valid);
    }
    // Clean team→session map for stopped sessions
    for (const [team, sessionId] of teamSessions) {
      try {
        const session = sessionManager.getSession(sessionId);
        if (session.status !== 'running') teamSessions.delete(team);
      } catch {
        teamSessions.delete(team);
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

  // Auto-discover public demo session (no session ID needed)
  router.get('/api/session/demo', (_req: Request, res: Response) => {
    try {
      const session = sessionManager.findPublicSession();
      if (session) {
        res.json({
          sessionId: session.id,
          sessionName: session.name,
          isPublic: true,
        });
      } else {
        res.status(404).json({ error: 'No public demo session available' });
      }
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

  // Check if demo mode is available (no auth)
  router.get('/api/demo/available', (_req: Request, res: Response) => {
    res.json({ enabled: !!config.demoProjectPath });
  });

  // Look up an existing team demo session (no auth)
  router.get('/api/demo/team', (req: Request, res: Response) => {
    try {
      if (!config.demoProjectPath) {
        res.status(404).json({ error: 'Demo mode is not enabled' });
        return;
      }

      const rawName = (req.query.name as string || '').trim();
      const teamName = rawName.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
      if (!teamName) {
        res.status(400).json({ error: 'Team name is required' });
        return;
      }

      const existingId = teamSessions.get(teamName);
      if (existingId) {
        try {
          const session = sessionManager.getSession(existingId);
          if (session.status === 'running') {
            res.json({ sessionId: existingId, sessionName: teamName });
            return;
          }
        } catch {
          teamSessions.delete(teamName);
        }
      }

      res.status(404).json({ error: 'No session found for this team. Ask your team lead for the password.' });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Create a new team demo session with a PIN (no auth)
  router.post('/api/demo/team', async (req: Request, res: Response) => {
    try {
      if (!config.demoProjectPath) {
        res.status(404).json({ error: 'Demo mode is not enabled' });
        return;
      }

      const { name: rawName, password, ownerName } = req.body as { name?: string; password?: string; ownerName?: string };
      const teamName = (rawName || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
      if (!teamName) {
        res.status(400).json({ error: 'Team name is required' });
        return;
      }
      if (!password || password.length < 4) {
        res.status(400).json({ error: 'A password of at least 4 characters is required' });
        return;
      }

      // Check if team already has a running session
      const existingId = teamSessions.get(teamName);
      if (existingId) {
        try {
          const session = sessionManager.getSession(existingId);
          if (session.status === 'running') {
            res.status(409).json({ error: 'A session for this team already exists. Join with the password instead.' });
            return;
          }
        } catch {
          teamSessions.delete(teamName);
        }
      }

      // Rate limit
      const ip = req.ip || 'unknown';
      const now = Date.now();
      const ipTimestamps = (demoCreateAttempts.get(ip) || []).filter(
        (t) => now - t < DEMO_CREATE_WINDOW_MS
      );
      if (ipTimestamps.length >= DEMO_CREATE_LIMIT) {
        res.status(429).json({ error: 'Too many demo rooms created. Try again later.' });
        return;
      }

      // Check max concurrent demo rooms
      let activeDemoCount = 0;
      for (const sessionId of teamSessions.values()) {
        try {
          const s = sessionManager.getSession(sessionId);
          if (s.status === 'running') activeDemoCount++;
        } catch {}
      }
      if (activeDemoCount >= config.maxDemoRooms) {
        res.status(429).json({ error: 'All demo rooms are currently in use. Please try again later.' });
        return;
      }

      // Create session with password (not public)
      // persistent: true gives each demo its own Docker volume for isolation
      const { session, token } = await sessionManager.createSession({
        projectPath: config.demoProjectPath,
        ownerName: ownerName || 'host',
        password,
        isPublic: false,
        name: teamName,
        demoDurationMs: config.demoSessionDurationMs,
        persistent: true,
      });

      teamSessions.set(teamName, session.id);
      ipTimestamps.push(now);
      demoCreateAttempts.set(ip, ipTimestamps);

      res.json({ sessionId: session.id, sessionName: teamName, token });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Export workspace as tar.gz (auth required, any role)
  router.get('/api/session/export/workspace', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { sessionId, userId } = req.tokenPayload!;
      const session = sessionManager.getSession(sessionId);

      if (session.status !== 'running') {
        res.status(400).json({ error: 'Session is not running' });
        return;
      }

      session.auditLogger?.log('workspace.exported', { userId, ip: req.ip });

      const stdout = await session.dockerManager.execStream(
        session.containerId,
        ['tar', 'czf', '-', '-C', '/', 'workspace']
      );

      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="workspace-${session.name}.tar.gz"`);
      stdout.pipe(res);
    } catch (err) {
      handleError(res, err);
    }
  });

  // Export command history as text (auth required, any role)
  router.get('/api/session/export/history', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { sessionId, userId } = req.tokenPayload!;
      const session = sessionManager.getSession(sessionId);

      const filePath = session.auditLogger?.getFilePath();
      if (!filePath || !fs.existsSync(filePath)) {
        res.status(404).json({ error: 'No audit log available' });
        return;
      }

      const lines: string[] = [];
      const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        try {
          const event = JSON.parse(line);
          if (event.type === 'terminal.input') {
            const ts = new Date(event.ts);
            const date = ts.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
            const user = event.userName || event.userId || 'unknown';
            const cmd = event.data?.input || '';
            lines.push(`[${date}] ${user}: ${cmd}`);
          }
        } catch {
          // Skip malformed lines
        }
      }

      session.auditLogger?.log('history.exported', { userId, ip: req.ip });

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="history-${session.name}.txt"`);
      res.send(lines.join('\n'));
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── Lead capture (no auth required) ──
  router.post('/api/leads', (req: Request, res: Response) => {
    try {
      const email = (req.body?.email || '').trim().toLowerCase();
      const source = (req.body?.source || 'demo').trim().slice(0, 50);

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Valid email required' });
        return;
      }

      const leadsDir = path.join(config.dataDir, 'leads');
      fs.mkdirSync(leadsDir, { recursive: true });
      const leadsFile = path.join(leadsDir, 'leads.ndjson');

      const entry = JSON.stringify({
        email,
        source,
        ip: req.ip,
        ts: new Date().toISOString(),
        userAgent: (req.headers['user-agent'] || '').slice(0, 200),
      }) + '\n';

      fs.appendFileSync(leadsFile, entry);
      res.json({ ok: true });
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
