import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AuditEvent, AuditEventType } from './audit-types';
import { DEFAULTS } from '../../shared/constants';

const CHAIN_SEED = 'sharedterminal-audit-chain-v1';

export class AuditLogger {
  private filePath: string;
  private fd: number;
  private bytesWritten = 0;
  private closed = false;
  /** Last hash in the chain — used to link each new entry to its predecessor */
  private lastHash: string;

  constructor(dataDir: string, sessionId: string) {
    const auditDir = path.join(dataDir, 'audit');
    fs.mkdirSync(auditDir, { recursive: true });
    this.filePath = path.join(auditDir, `${sessionId}.ndjson`);
    this.fd = fs.openSync(this.filePath, 'a');
    // Track existing file size
    try {
      const stats = fs.fstatSync(this.fd);
      this.bytesWritten = stats.size;
    } catch {
      this.bytesWritten = 0;
    }
    // Recover last hash from existing log for chain continuity
    this.lastHash = this.recoverLastHash();
  }

  /** Read the last line of the audit file to recover the chain hash */
  private recoverLastHash(): string {
    try {
      if (this.bytesWritten === 0) return CHAIN_SEED;
      const content = fs.readFileSync(this.filePath, 'utf-8').trimEnd();
      const lines = content.split('\n');
      const lastLine = lines[lines.length - 1];
      if (lastLine) {
        const event = JSON.parse(lastLine);
        if (event.hash) return event.hash;
      }
    } catch {
      // Start a new chain if recovery fails
    }
    return CHAIN_SEED;
  }

  private computeHash(prevHash: string, eventJson: string): string {
    return crypto.createHash('sha256').update(prevHash + eventJson).digest('hex');
  }

  log(
    type: AuditEventType,
    opts: {
      userId?: string;
      userName?: string;
      ip?: string;
      data?: Record<string, unknown>;
      sessionId?: string;
    } = {}
  ): void {
    if (this.closed) return;

    const event: AuditEvent = {
      ts: new Date().toISOString(),
      type,
      sessionId: opts.sessionId || this.getSessionIdFromPath(),
      userId: opts.userId,
      userName: opts.userName,
      ip: opts.ip,
      data: opts.data,
      prevHash: this.lastHash,
    };

    // Compute hash over (prevHash + event-without-hash) for tamper evidence
    const payload = JSON.stringify(event);
    event.hash = this.computeHash(this.lastHash, payload);
    this.lastHash = event.hash;

    const line = JSON.stringify(event) + '\n';
    const bytes = Buffer.byteLength(line);
    fs.writeSync(this.fd, line);
    this.bytesWritten += bytes;

    // Rotate if needed
    if (this.bytesWritten >= (DEFAULTS.AUDIT_MAX_FILE_SIZE as number)) {
      this.rotate();
    }
  }

  private getSessionIdFromPath(): string {
    return path.basename(this.filePath, '.ndjson');
  }

  private rotate(): void {
    fs.closeSync(this.fd);

    // Rename current to .1, shift older files
    const maxRotated = DEFAULTS.AUDIT_MAX_ROTATED_FILES as number;
    for (let i = maxRotated; i >= 1; i--) {
      const from = i === 1
        ? this.filePath
        : `${this.filePath}.${i - 1}`;
      const to = `${this.filePath}.${i}`;
      try {
        if (fs.existsSync(from)) {
          fs.renameSync(from, to);
        }
      } catch {
        // Ignore rotation errors
      }
    }

    // Delete oldest if exceeds max
    const oldest = `${this.filePath}.${maxRotated + 1}`;
    try { fs.unlinkSync(oldest); } catch {}

    // Create fresh file
    this.fd = fs.openSync(this.filePath, 'a');
    this.bytesWritten = 0;
  }

  getFilePath(): string {
    return this.filePath;
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      try { fs.closeSync(this.fd); } catch {}
    }
  }

  /**
   * Verify the integrity of an audit log file by replaying the hash chain.
   * Returns { valid, entries, brokenAt } where brokenAt is the 0-indexed
   * line where the chain breaks (undefined if valid).
   */
  static verifyChain(filePath: string): { valid: boolean; entries: number; brokenAt?: number } {
    const content = fs.readFileSync(filePath, 'utf-8').trimEnd();
    if (!content) return { valid: true, entries: 0 };

    const lines = content.split('\n');
    let prevHash = CHAIN_SEED;

    for (let i = 0; i < lines.length; i++) {
      const event: AuditEvent = JSON.parse(lines[i]);
      const storedHash = event.hash;

      if (event.prevHash !== prevHash) {
        return { valid: false, entries: lines.length, brokenAt: i };
      }

      // Recompute: hash over (prevHash + event-without-hash)
      const { hash: _, ...eventWithoutHash } = event;
      const payload = JSON.stringify(eventWithoutHash);
      const expectedHash = crypto.createHash('sha256').update(prevHash + payload).digest('hex');

      if (storedHash !== expectedHash) {
        return { valid: false, entries: lines.length, brokenAt: i };
      }

      prevHash = storedHash;
    }

    return { valid: true, entries: lines.length };
  }
}
