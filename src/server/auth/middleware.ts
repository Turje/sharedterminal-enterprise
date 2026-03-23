import { Request, Response, NextFunction } from 'express';
import { Socket } from 'socket.io';
import { TokenStore } from './token';
import { AuthenticationError } from '../../shared/errors';
import { TokenPayload } from '../../shared/types';

declare global {
  namespace Express {
    interface Request {
      tokenPayload?: TokenPayload;
    }
  }
}

export function createExpressAuthMiddleware(tokenStore: TokenStore) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Token from header or query
    const token =
      req.headers.authorization?.replace('Bearer ', '') ||
      (req.query.token as string);

    if (!token) {
      res.status(401).json({ error: 'No token provided', code: 'AUTH_FAILED' });
      return;
    }

    try {
      req.tokenPayload = tokenStore.validate(token);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token', code: 'AUTH_FAILED' });
    }
  };
}

export function createSocketAuthMiddleware(tokenStore: TokenStore) {
  return (socket: Socket, next: (err?: Error) => void) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      return next(new AuthenticationError('No token provided'));
    }

    try {
      const payload = tokenStore.validate(token);
      socket.data.userId = payload.userId;
      socket.data.sessionId = payload.sessionId;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new AuthenticationError('Invalid token'));
    }
  };
}
