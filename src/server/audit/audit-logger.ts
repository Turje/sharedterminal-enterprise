import fs from 'fs';
import path from 'path';
import { AuditEvent, AuditEventType } from './audit-types';
import { DEFAULTS } from '../../shared/constants';

export class AuditLogger {
  private filePath: string;
  private fd: number;
  private bytesWritten = 0;
  private closed = false;

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
    };

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
}
