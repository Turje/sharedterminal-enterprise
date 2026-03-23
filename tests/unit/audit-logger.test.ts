import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { AuditLogger } from '../../src/server/audit/audit-logger';

describe('AuditLogger', () => {
  const tmpDir = path.join(os.tmpdir(), `audit-test-${Date.now()}`);
  const sessionId = 'test-session-123';
  let logger: AuditLogger;

  afterEach(() => {
    logger?.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('creates audit directory and file', () => {
    logger = new AuditLogger(tmpDir, sessionId);
    const filePath = logger.getFilePath();
    expect(filePath).toContain(sessionId);
    expect(filePath).toContain('audit');
  });

  it('writes NDJSON events', () => {
    logger = new AuditLogger(tmpDir, sessionId);
    logger.log('session.created', {
      userId: 'user-1',
      userName: 'saar',
      data: { projectPath: '/test' },
    });
    logger.log('chat.message', {
      userId: 'user-1',
      userName: 'saar',
      data: { message: 'hello' },
    });
    logger.close();

    const content = fs.readFileSync(logger.getFilePath(), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);

    const event1 = JSON.parse(lines[0]);
    expect(event1.type).toBe('session.created');
    expect(event1.userId).toBe('user-1');
    expect(event1.userName).toBe('saar');
    expect(event1.ts).toBeDefined();

    const event2 = JSON.parse(lines[1]);
    expect(event2.type).toBe('chat.message');
  });

  it('includes sessionId in events', () => {
    logger = new AuditLogger(tmpDir, sessionId);
    logger.log('session.joined', { userId: 'u1' });
    logger.close();

    const content = fs.readFileSync(logger.getFilePath(), 'utf-8');
    const event = JSON.parse(content.trim());
    expect(event.sessionId).toBe(sessionId);
  });
});
