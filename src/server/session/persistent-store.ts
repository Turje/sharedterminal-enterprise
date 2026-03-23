import fs from 'fs';
import path from 'path';
import os from 'os';

export interface PersistentSessionRecord {
  sessionId: string;
  containerId: string;
  volumeName: string;
  homeVolumeName: string;
  projectPath: string;
  createdAt: string;
  lastAccessedAt: string;
}

export class PersistentStore {
  private filePath: string;
  private sessions: Map<string, PersistentSessionRecord>;

  constructor(dataDir?: string) {
    const dir = dataDir || path.join(os.homedir(), '.sharedterminal', 'data');
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, 'sessions.json');
    this.sessions = new Map();
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        if (Array.isArray(data)) {
          for (const record of data) {
            this.sessions.set(record.sessionId, record);
          }
        }
      }
    } catch {
      // Start fresh if corrupted
      this.sessions = new Map();
    }
  }

  private save(): void {
    const data = Array.from(this.sessions.values());
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  saveSession(record: PersistentSessionRecord): void {
    this.sessions.set(record.sessionId, record);
    this.save();
  }

  getSession(sessionId: string): PersistentSessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.save();
  }

  listSessions(): PersistentSessionRecord[] {
    return Array.from(this.sessions.values());
  }

  updateLastAccessed(sessionId: string): void {
    const record = this.sessions.get(sessionId);
    if (record) {
      record.lastAccessedAt = new Date().toISOString();
      this.save();
    }
  }
}
