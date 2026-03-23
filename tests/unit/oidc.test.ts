import { describe, it, expect } from 'vitest';
import { generateOidcState, isEmailDomainAllowed, clearOidcCache } from '../../src/server/auth/oidc';

describe('OIDC Utilities', () => {
  it('generates cryptographically random state values', () => {
    const state1 = generateOidcState();
    const state2 = generateOidcState();
    expect(state1).not.toBe(state2);
    expect(state1.length).toBe(64); // 32 bytes hex = 64 chars
    expect(/^[a-f0-9]+$/.test(state1)).toBe(true);
  });

  it('validates email domain allowlist', () => {
    expect(isEmailDomainAllowed('user@company.com', ['company.com'])).toBe(true);
    expect(isEmailDomainAllowed('user@other.com', ['company.com'])).toBe(false);
    expect(isEmailDomainAllowed('user@COMPANY.COM', ['company.com'])).toBe(true);
    expect(isEmailDomainAllowed('user@sub.company.com', ['company.com'])).toBe(false);
  });

  it('allows all domains when allowlist is empty', () => {
    expect(isEmailDomainAllowed('user@anything.com', [])).toBe(true);
    expect(isEmailDomainAllowed('user@random.org', [])).toBe(true);
  });

  it('supports multiple allowed domains', () => {
    const domains = ['company.com', 'subsidiary.com', 'partner.org'];
    expect(isEmailDomainAllowed('user@company.com', domains)).toBe(true);
    expect(isEmailDomainAllowed('user@subsidiary.com', domains)).toBe(true);
    expect(isEmailDomainAllowed('user@partner.org', domains)).toBe(true);
    expect(isEmailDomainAllowed('user@hacker.com', domains)).toBe(false);
  });

  it('clears OIDC cache without error', () => {
    expect(() => clearOidcCache()).not.toThrow();
  });
});
