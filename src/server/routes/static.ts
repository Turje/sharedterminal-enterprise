import { Router } from 'express';
import path from 'path';
import express from 'express';

export function createStaticRouter(): Router {
  const router = Router();
  const clientDir = path.join(__dirname, '../../client');

  router.use(express.static(clientDir));

  router.get('/', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });

  return router;
}
