import fs from 'fs';
import path from 'path';
import { AsciicastHeader, AsciicastEvent } from './recording-format';
import { DEFAULTS } from '../../shared/constants';

export class SessionRecorder {
  private dir: string;
  private fds = new Map<string, number>();
  private startTimes = new Map<string, number>();

  constructor(dataDir: string, sessionId: string) {
    this.dir = path.join(dataDir, 'recordings', sessionId);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  startTerminal(terminalId: string, cols?: number, rows?: number): void {
    const filePath = path.join(this.dir, `${terminalId}.cast`);
    const fd = fs.openSync(filePath, 'a');
    const startTime = Date.now();

    const header: AsciicastHeader = {
      version: 2,
      width: cols || DEFAULTS.TERMINAL_COLS,
      height: rows || DEFAULTS.TERMINAL_ROWS,
      timestamp: Math.floor(startTime / 1000),
    };

    fs.writeSync(fd, JSON.stringify(header) + '\n');
    this.fds.set(terminalId, fd);
    this.startTimes.set(terminalId, startTime);
  }

  recordOutput(terminalId: string, data: string): void {
    this.writeEvent(terminalId, 'o', data);
  }

  recordInput(terminalId: string, data: string): void {
    this.writeEvent(terminalId, 'i', data);
  }

  private writeEvent(terminalId: string, type: 'o' | 'i', data: string): void {
    const fd = this.fds.get(terminalId);
    const startTime = this.startTimes.get(terminalId);
    if (fd === undefined || startTime === undefined) return;

    const offset = (Date.now() - startTime) / 1000;
    const event: AsciicastEvent = [offset, type, data];
    fs.writeSync(fd, JSON.stringify(event) + '\n');
  }

  stopTerminal(terminalId: string): void {
    const fd = this.fds.get(terminalId);
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
      this.fds.delete(terminalId);
      this.startTimes.delete(terminalId);
    }
  }

  getRecordingDir(): string {
    return this.dir;
  }

  listRecordings(): string[] {
    try {
      return fs.readdirSync(this.dir).filter((f) => f.endsWith('.cast'));
    } catch {
      return [];
    }
  }

  close(): void {
    for (const fd of this.fds.values()) {
      try { fs.closeSync(fd); } catch {}
    }
    this.fds.clear();
    this.startTimes.clear();
  }
}
