import { describe, it, expect } from 'vitest';
import { scanForSecrets } from '../../src/server/security/dlp';

describe('DLP Secret Scanner', () => {
  it('detects AWS access keys', () => {
    const result = scanForSecrets('export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE');
    expect(result.secretsFound).toContain('AWS Access Key');
    expect(result.output).toContain('[***REDACTED BY DLP***]');
    expect(result.output).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('detects GitHub tokens', () => {
    const result = scanForSecrets('GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
    expect(result.secretsFound).toContain('GitHub Token (ghp)');
    expect(result.output).toContain('[***REDACTED BY DLP***]');
  });

  it('detects private keys', () => {
    const result = scanForSecrets('-----BEGIN RSA PRIVATE KEY-----');
    expect(result.secretsFound).toContain('Private Key');
    expect(result.output).toContain('[***REDACTED BY DLP***]');
  });

  it('detects bearer tokens', () => {
    const result = scanForSecrets('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test.signature');
    expect(result.secretsFound).toContain('Bearer Token');
    expect(result.output).toContain('[***REDACTED BY DLP***]');
  });

  it('detects password env vars', () => {
    const result = scanForSecrets('export DB_PASSWORD=mysecretpass123');
    expect(result.secretsFound).toContain('Password Env Var');
    expect(result.output).toContain('[***REDACTED BY DLP***]');
  });

  it('passes through normal text unchanged', () => {
    const text = 'This is just normal terminal output with ls -la and git status';
    const result = scanForSecrets(text);
    expect(result.secretsFound).toHaveLength(0);
    expect(result.output).toBe(text);
  });

  it('detects multiple secrets in one string', () => {
    const text = 'KEY=AKIAIOSFODNN7EXAMPLE TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
    const result = scanForSecrets(text);
    expect(result.secretsFound.length).toBeGreaterThanOrEqual(2);
  });

  it('detects Stripe keys', () => {
    const result = scanForSecrets('STRIPE_KEY=sk_test_FAKEFAKEFAKEFAKEFAKE');
    expect(result.secretsFound).toContain('Stripe Key');
    expect(result.output).toContain('[***REDACTED BY DLP***]');
  });
});
