import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import express from 'express';

export function createStaticRouter(): Router {
  const router = Router();
  const clientDir = path.join(__dirname, '../../client');

  // Hashed assets (bundle-[hash].js) — cache forever
  router.use('/js', (req: Request, res: Response, next: NextFunction) => {
    if (/main-[A-Z0-9]+\.js/.test(req.path)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    next();
  });

  // CSS/JS with query string version — cache for 1 year (version changes on rebuild)
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (req.query.v && /\.(css|js)$/.test(req.path)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    next();
  });

  router.use(express.static(clientDir));

  // HTML — always revalidate
  router.get('/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDir, 'index.html'));
  });

  return router;
}
