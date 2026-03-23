import { describe, it, expect } from 'vitest';
import { generateId, generateToken, validateTerminalSize, sanitizeInput } from '../../src/shared/utils';

describe('utils', () => {
  it('should generate unique ids', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should generate unique tokens', () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
  });

  it('should validate terminal size', () => {
    expect(validateTerminalSize({ cols: 80, rows: 24 })).toBe(true);
    expect(validateTerminalSize({ cols: 0, rows: 24 })).toBe(false);
    expect(validateTerminalSize({ cols: 501, rows: 24 })).toBe(false);
    expect(validateTerminalSize({ cols: 80, rows: 0 })).toBe(false);
    expect(validateTerminalSize({ cols: 80, rows: 201 })).toBe(false);
    expect(validateTerminalSize(null)).toBe(false);
    expect(validateTerminalSize('bad')).toBe(false);
  });

  it('should sanitize input by capping length', () => {
    const short = 'hello';
    expect(sanitizeInput(short)).toBe('hello');

    const long = 'x'.repeat(5000);
    expect(sanitizeInput(long).length).toBe(4096);
  });
});
