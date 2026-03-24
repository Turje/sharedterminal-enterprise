import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { SessionManager } from '../session/session-manager';
import { TokenStore } from '../auth/token';
import { ServerConfig } from '../config';
import { createExpressAuthMiddleware } from '../auth/middleware';
import { SharedTerminalError } from '../../shared/errors';

const CHAIN_SEED = 'sharedterminal-audit-chain-v1';

// DLP stats cache
let dlpCache: { data: any; expiresAt: number } | null = null;

export function createAdminRouter(
  sessionManager: SessionManager,
  tokenStore: TokenStore,
  config: ServerConfig
): Router {
  const router = Router();
  const authMiddleware = createExpressAuthMiddleware(tokenStore);

  // Serve the session recording player page (no auth — auth is in the API calls)
  router.get('/player', (_req: Request, res: Response) => {
    // Override CSP to allow asciinema-player CDN resources
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self'; img-src 'self' data:; font-src 'self' https://cdn.jsdelivr.net"
    );
    const playerPath = path.join(__dirname, '../../client/player.html');
    res.sendFile(playerPath);
  });

  // Serve admin dashboard HTML (no auth — auth is via token query param in API calls)
  router.get('/admin', (_req: Request, res: Response) => {
    const htmlPath = path.join(__dirname, '../../client/admin.html');
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).send('Admin dashboard not found. Run "npm run build" first.');
    }
  });

  // All admin routes require owner auth
  function ownerOnly(req: Request, res: Response): boolean {
    if (req.tokenPayload?.role !== 'owner') {
      res.status(403).json({ error: 'Owner access required' });
      return false;
    }
    return true;
  }

  // Helper: resolve audit file path for a session
  function resolveAuditPath(sessionId: string): string | null {
    // Try active session first
    try {
      const session = sessionManager.getSession(sessionId);
      const filePath = session.auditLogger?.getFilePath();
      if (filePath && fs.existsSync(filePath)) return filePath;
    } catch {
      // Not active, try data dir
    }
    const fallback = path.join(config.dataDir, 'audit', `${sessionId}.ndjson`);
    if (fs.existsSync(fallback)) return fallback;
    return null;
  }

  // ── Admin Stats (enhanced with container resources + DLP hits) ──
  router.get('/api/admin/stats', authMiddleware, async (req: Request, res: Response) => {
    try {
      if (!ownerOnly(req, res)) return;

      const sessions = sessionManager.listSessionDetails();
      const dockerManager = sessionManager.getDockerManager();

      // Fetch container stats in parallel with 3s timeout
      const sessionsWithResources = await Promise.all(
        sessions.map(async (s) => {
          const resources = await dockerManager.getContainerStats(s.containerId);
          return { ...s, resources };
        })
      );

      // Quick DLP hit count from cache or scan
      let dlpHits = 0;
      try {
        const dlpData = await getDlpStats(config);
        dlpHits = dlpData.totalHits;
      } catch { /* ignore */ }

      const persistentSessions = sessionManager.listPersistentSessions();
      res.json({
        activeSessions: sessionsWithResources,
        persistentSessions,
        dlpHits,
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── List Sessions ──
  router.get('/api/admin/sessions', authMiddleware, (req: Request, res: Response) => {
    try {
      if (!ownerOnly(req, res)) return;
      const sessions = sessionManager.listSessions();
      const persistent = sessionManager.listPersistentSessions();
      res.json({ active: sessions, persistent });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── Kill Session ──
  router.post('/api/admin/session/:sessionId/kill', authMiddleware, async (req: Request, res: Response) => {
    try {
      if (!ownerOnly(req, res)) return;
      const sessionId = req.params.sessionId as string;
      const destroy = req.query.destroy === 'true';

      // Log audit event before stopping
      try {
        const session = sessionManager.getSession(sessionId);
        session.auditLogger?.log('session.stopped', {
          userId: req.tokenPayload?.userId,
          userName: 'admin',
          data: { reason: 'admin_kill', destroy },
        });
      } catch { /* session may not exist */ }

      if (destroy) {
        await sessionManager.destroySession(sessionId);
      } else {
        await sessionManager.stopSession(sessionId);
      }

      res.json({ status: 'killed', sessionId });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── Download Audit Log ──
  router.get('/api/admin/audit/:sessionId', authMiddleware, (req: Request, res: Response) => {
    try {
      if (!ownerOnly(req, res)) return;
      const sessionId = req.params.sessionId as string;
      const filePath = resolveAuditPath(sessionId);

      if (filePath) {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Content-Disposition', `attachment; filename="${sessionId}.ndjson"`);
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // Return empty file instead of 404 — audit may not have events yet
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Content-Disposition', `attachment; filename="${sessionId}.ndjson"`);
      res.send('');
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── Audit Log Search ──
  router.get('/api/admin/audit/:sessionId/search', authMiddleware, async (req: Request, res: Response) => {
    try {
      if (!ownerOnly(req, res)) return;
      const sessionId = req.params.sessionId as string;
      const q = (req.query.q as string || '').toLowerCase();
      const typeFilter = req.query.type ? (req.query.type as string).split(',') : [];
      const offset = parseInt(req.query.offset as string || '0', 10);
      const limit = Math.min(parseInt(req.query.limit as string || '100', 10), 500);

      const filePath = resolveAuditPath(sessionId);
      if (!filePath) {
        res.json({ events: [], total: 0, offset, limit });
        return;
      }

      const events: any[] = [];
      let total = 0;

      const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity,
      });

      let prevHash = CHAIN_SEED;

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);

          // Verify hash chain integrity for this event
          const storedHash = event.hash;
          const { hash: _, ...eventWithoutHash } = event;
          const payload = JSON.stringify(eventWithoutHash);
          const expectedHash = crypto.createHash('sha256').update(prevHash + payload).digest('hex');
          const hashValid = event.prevHash === prevHash && storedHash === expectedHash;
          prevHash = storedHash || prevHash;

          // Apply filters
          const matchesType = typeFilter.length === 0 || typeFilter.includes(event.type);
          const matchesText = !q || JSON.stringify(event.data || {}).toLowerCase().includes(q);

          if (matchesType && matchesText) {
            if (total >= offset && events.length < limit) {
              events.push({ ...event, hashValid });
            }
            total++;
          }
        } catch { /* skip malformed lines */ }
      }

      res.json({ events, total, offset, limit });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── DLP Stats ──
  router.get('/api/admin/dlp/stats', authMiddleware, async (req: Request, res: Response) => {
    try {
      if (!ownerOnly(req, res)) return;
      const data = await getDlpStats(config);
      res.json(data);
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── Recordings ──
  router.get('/api/admin/recordings/:sessionId', authMiddleware, (req: Request, res: Response) => {
    try {
      if (!ownerOnly(req, res)) return;
      const sessionId = req.params.sessionId as string;

      try {
        const session = sessionManager.getSession(sessionId);
        const recordings = session.recorder?.listRecordings() || [];
        res.json({ recordings });
      } catch {
        res.status(404).json({ error: 'Session not found' });
      }
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/api/admin/recordings/:sessionId/:terminalId', authMiddleware, (req: Request, res: Response) => {
    try {
      if (!ownerOnly(req, res)) return;
      const sessionId = req.params.sessionId as string;
      const terminalId = req.params.terminalId as string;

      try {
        const session = sessionManager.getSession(sessionId);
        const dir = session.recorder?.getRecordingDir();
        if (!dir) {
          res.status(404).json({ error: 'Recordings not enabled' });
          return;
        }

        const filePath = path.join(dir, `${terminalId}.cast`);
        if (!fs.existsSync(filePath)) {
          res.status(404).json({ error: 'Recording not found' });
          return;
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${terminalId}.cast"`);
        fs.createReadStream(filePath).pipe(res);
      } catch {
        res.status(404).json({ error: 'Session not found' });
      }
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── Admin Feedback ──
  router.post('/api/admin/feedback', authMiddleware, (req: Request, res: Response) => {
    try {
      if (!ownerOnly(req, res)) return;
      const { role, feedback, email } = req.body || {};
      const entry = {
        ts: new Date().toISOString(),
        role: String(role || '').slice(0, 100),
        feedback: String(feedback || '').slice(0, 2000),
        email: String(email || '').slice(0, 200),
        ip: req.ip,
      };
      const feedbackPath = path.join(config.dataDir, 'admin-feedback.ndjson');
      fs.appendFileSync(feedbackPath, JSON.stringify(entry) + '\n');
      res.json({ status: 'saved' });
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}

async function getDlpStats(config: ServerConfig): Promise<{
  totalHits: number;
  byPattern: Record<string, number>;
  bySession: Record<string, number>;
  recentHits: any[];
}> {
  const now = Date.now();
  if (dlpCache && now < dlpCache.expiresAt) {
    return dlpCache.data;
  }

  const result = { totalHits: 0, byPattern: {} as Record<string, number>, bySession: {} as Record<string, number>, recentHits: [] as any[] };
  const auditDir = path.join(config.dataDir, 'audit');

  if (!fs.existsSync(auditDir)) {
    dlpCache = { data: result, expiresAt: now + 30_000 };
    return result;
  }

  const files = fs.readdirSync(auditDir).filter((f) => f.endsWith('.ndjson'));

  for (const file of files) {
    const filePath = path.join(auditDir, file);
    const sessionId = path.basename(file, '.ndjson');
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'security.dlp_detected') {
            result.totalHits++;
            result.bySession[sessionId] = (result.bySession[sessionId] || 0) + 1;
            const pattern = event.data?.pattern || 'unknown';
            result.byPattern[pattern] = (result.byPattern[pattern] || 0) + 1;
            if (result.recentHits.length < 20) {
              result.recentHits.push({ ts: event.ts, sessionId, pattern, data: event.data });
            }
          }
        } catch { /* skip */ }
      }
    } catch { /* skip unreadable files */ }
  }

  // Sort recent hits by timestamp descending
  result.recentHits.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  dlpCache = { data: result, expiresAt: now + 30_000 };
  return result;
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof SharedTerminalError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
  } else {
    console.error('Unhandled admin error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
