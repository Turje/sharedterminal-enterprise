import { TokenPayload, Role } from '../../shared/types';
import { generateToken } from '../../shared/utils';
import { AuthenticationError } from '../../shared/errors';
import { DEFAULTS } from '../../shared/constants';

export class TokenStore {
  private tokens = new Map<string, TokenPayload>();

  create(sessionId: string, userId: string, role: Role, ttlMs: number = DEFAULTS.TOKEN_TTL_MS): string {
    const token = generateToken();
    const now = Date.now();
    this.tokens.set(token, {
      token,
      sessionId,
      userId,
      role,
      createdAt: now,
      expiresAt: now + ttlMs,
    });
    return token;
  }

  validate(token: string): TokenPayload {
    const payload = this.tokens.get(token);
    if (!payload) {
      throw new AuthenticationError('Invalid token');
    }
    if (Date.now() >= payload.expiresAt) {
      this.tokens.delete(token);
      throw new AuthenticationError('Token expired');
    }
    return payload;
  }

  revoke(token: string): void {
    this.tokens.delete(token);
  }

  revokeBySession(sessionId: string): void {
    for (const [token, payload] of this.tokens) {
      if (payload.sessionId === sessionId) {
        this.tokens.delete(token);
      }
    }
  }

  revokeByUser(userId: string): void {
    for (const [token, payload] of this.tokens) {
      if (payload.userId === userId) {
        this.tokens.delete(token);
      }
    }
  }

  getBySession(sessionId: string): TokenPayload[] {
    return Array.from(this.tokens.values()).filter(
      (p) => p.sessionId === sessionId
    );
  }
}
