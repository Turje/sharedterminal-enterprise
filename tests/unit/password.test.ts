import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/server/auth/password';

describe('Password hashing', () => {
  it('should hash and verify a correct password', async () => {
    const hash = await hashPassword('my-secret');
    const result = await verifyPassword('my-secret', hash);
    expect(result).toBe(true);
  });

  it('should reject a wrong password', async () => {
    const hash = await hashPassword('my-secret');
    const result = await verifyPassword('wrong-password', hash);
    expect(result).toBe(false);
  });

  it('should produce unique salts for the same password', async () => {
    const hash1 = await hashPassword('same-password');
    const hash2 = await hashPassword('same-password');
    expect(hash1).not.toBe(hash2);

    // Both should still verify
    expect(await verifyPassword('same-password', hash1)).toBe(true);
    expect(await verifyPassword('same-password', hash2)).toBe(true);
  });

  it('should return false for malformed hash strings', async () => {
    expect(await verifyPassword('test', 'nocolon')).toBe(false);
    expect(await verifyPassword('test', '')).toBe(false);
  });
});
