import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { TerminalSize } from './types';

export function generateId(): string {
  return uuidv4();
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function validateTerminalSize(size: unknown): size is TerminalSize {
  if (!size || typeof size !== 'object') return false;
  const s = size as Record<string, unknown>;
  return (
    typeof s.cols === 'number' &&
    typeof s.rows === 'number' &&
    s.cols > 0 &&
    s.cols <= 500 &&
    s.rows > 0 &&
    s.rows <= 200
  );
}

export function sanitizeInput(input: string): string {
  // Allow terminal control sequences but cap length
  return input.slice(0, 4096);
}

export function formatSessionUrl(host: string, port: number, sessionId: string): string {
  const protocol = 'https';
  return `${protocol}://${host}:${port}/?session=${sessionId}`;
}

export function formatSessionUrlFromBase(baseUrl: string, sessionId: string): string {
  return `${baseUrl}/?session=${sessionId}`;
}

export function generatePassword(length = 6): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}
