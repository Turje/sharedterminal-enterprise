import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { SessionManager } from '../session/session-manager';
import { TokenStore } from '../auth/token';
import { createExpressAuthMiddleware } from '../auth/middleware';
import { SharedTerminalError } from '../../shared/errors';

export function createAdminRouter(
  sessionManager: SessionManager,
  tokenStore: TokenStore
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

  // Admin stats endpoint for the dashboard
  router.get('/api/admin/stats', authMiddleware, (req: Request, res: Response) => {
    try {
      if (!ownerOnly(req, res)) return;
      const activeSessions = sessionManager.listSessions();
      const persistentSessions = sessionManager.listPersistentSessions();
      res.json({
        activeSessions,
        persistentSessions,
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  // List all active sessions
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

  // Download audit log for a session
  router.get('/api/admin/audit/:sessionId', authMiddleware, (req: Request, res: Response) => {
    try {
      if (!ownerOnly(req, res)) return;
      const sessionId = req.params.sessionId as string;

      // Try to get audit file from active session first
      try {
        const session = sessionManager.getSession(sessionId);
        const filePath = session.auditLogger?.getFilePath();
        if (filePath && fs.existsSync(filePath)) {
          res.setHeader('Content-Type', 'application/x-ndjson');
          res.setHeader('Content-Disposition', `attachment; filename="${sessionId}.ndjson"`);
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      } catch {
        // Session may not be active, that's ok
      }

      res.status(404).json({ error: 'Audit log not found' });
    } catch (err) {
      handleError(res, err);
    }
  });

  // List recording files for a session
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

  // Download a specific recording file
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

  return router;
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof SharedTerminalError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
  } else {
    console.error('Unhandled admin error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
