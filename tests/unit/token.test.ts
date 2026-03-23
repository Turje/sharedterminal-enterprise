import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TokenStore } from '../../src/server/auth/token';
import { AuthenticationError } from '../../src/shared/errors';

describe('TokenStore', () => {
  let store: TokenStore;

  beforeEach(() => {
    store = new TokenStore();
  });

  it('should create and validate a token', () => {
    const token = store.create('session-1', 'user-1', 'owner');
    const payload = store.validate(token);

    expect(payload.sessionId).toBe('session-1');
    expect(payload.userId).toBe('user-1');
    expect(payload.role).toBe('owner');
    expect(payload.token).toBe(token);
    expect(payload.expiresAt).toBeGreaterThan(Date.now());
  });

  it('should throw on invalid token', () => {
    expect(() => store.validate('bad-token')).toThrow(AuthenticationError);
  });

  it('should revoke a token', () => {
    const token = store.create('session-1', 'user-1', 'owner');
    store.revoke(token);
    expect(() => store.validate(token)).toThrow(AuthenticationError);
  });

  it('should revoke all tokens for a session', () => {
    const t1 = store.create('session-1', 'user-1', 'owner');
    const t2 = store.create('session-1', 'user-2', 'editor');
    const t3 = store.create('session-2', 'user-3', 'owner');

    store.revokeBySession('session-1');

    expect(() => store.validate(t1)).toThrow();
    expect(() => store.validate(t2)).toThrow();
    expect(store.validate(t3)).toBeTruthy();
  });

  it('should get tokens by session', () => {
    store.create('session-1', 'user-1', 'owner');
    store.create('session-1', 'user-2', 'editor');
    store.create('session-2', 'user-3', 'owner');

    const tokens = store.getBySession('session-1');
    expect(tokens).toHaveLength(2);
  });

  describe('token expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should reject an expired token', () => {
      const token = store.create('session-1', 'user-1', 'owner', 1000);

      // Still valid
      expect(store.validate(token)).toBeTruthy();

      // Advance past expiry
      vi.advanceTimersByTime(1001);

      expect(() => store.validate(token)).toThrow('Token expired');
    });

    it('should accept a token within its TTL', () => {
      const token = store.create('session-1', 'user-1', 'owner', 5000);

      vi.advanceTimersByTime(4999);

      const payload = store.validate(token);
      expect(payload.sessionId).toBe('session-1');
    });

    it('should use custom TTL when provided', () => {
      const token = store.create('session-1', 'user-1', 'owner', 500);

      vi.advanceTimersByTime(501);

      expect(() => store.validate(token)).toThrow('Token expired');
    });
  });
});
