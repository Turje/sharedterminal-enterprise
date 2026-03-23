import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SessionRecorder } from '../../src/server/recording/session-recorder';

describe('SessionRecorder', () => {
  const tmpDir = path.join(os.tmpdir(), `recording-test-${Date.now()}`);
  const sessionId = 'test-session-rec';
  let recorder: SessionRecorder;

  afterEach(() => {
    recorder?.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('creates recording directory', () => {
    recorder = new SessionRecorder(tmpDir, sessionId);
    expect(fs.existsSync(recorder.getRecordingDir())).toBe(true);
  });

  it('writes asciicast v2 header and events', () => {
    recorder = new SessionRecorder(tmpDir, sessionId);
    const terminalId = 'term-1';

    recorder.startTerminal(terminalId, 120, 40);
    recorder.recordOutput(terminalId, 'hello world\r\n');
    recorder.recordInput(terminalId, 'ls -la\r');
    recorder.recordOutput(terminalId, 'file1.txt\r\nfile2.txt\r\n');
    recorder.stopTerminal(terminalId);

    const filePath = path.join(recorder.getRecordingDir(), `${terminalId}.cast`);
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    // First line is the header
    const header = JSON.parse(lines[0]);
    expect(header.version).toBe(2);
    expect(header.width).toBe(120);
    expect(header.height).toBe(40);

    // Event lines: [offset, type, data]
    const event1 = JSON.parse(lines[1]);
    expect(event1[1]).toBe('o'); // output
    expect(event1[2]).toBe('hello world\r\n');

    const event2 = JSON.parse(lines[2]);
    expect(event2[1]).toBe('i'); // input
    expect(event2[2]).toBe('ls -la\r');
  });

  it('lists recording files', () => {
    recorder = new SessionRecorder(tmpDir, sessionId);
    recorder.startTerminal('t1');
    recorder.startTerminal('t2');
    recorder.stopTerminal('t1');
    recorder.stopTerminal('t2');

    const files = recorder.listRecordings();
    expect(files).toContain('t1.cast');
    expect(files).toContain('t2.cast');
  });
});
