import { Session, SessionStatus, SessionInfo, User, Role } from '../../shared/types';
import { TerminalManager } from '../terminal/terminal-manager';
import { PresenceManager } from '../presence/presence-manager';
import { DockerManager } from '../docker/docker-manager';
import { AuditLogger } from '../audit/audit-logger';
import { SessionRecorder } from '../recording/session-recorder';
import { DEFAULTS } from '../../shared/constants';
import { ServerConfig } from '../config';

export class SessionState implements Session {
  public status: SessionStatus = 'creating';
  public users = new Map<string, User>();
  public terminalManager: TerminalManager;
  public presenceManager: PresenceManager;
  public auditLogger: AuditLogger | null = null;
  public recorder: SessionRecorder | null = null;
  public bannedUsers = new Set<string>();
  public bannedIps = new Set<string>();
  public readonly createdAt: Date;
  public readonly expiresAt: Date;
  public lastActivity: number;
  public readonly persistent: boolean;
  public readonly isPublic: boolean;
  public readonly isDemo: boolean;
  public readonly demoExpiresAt: Date | null;
  public readonly dockerManager: DockerManager;
  public adminPin: string = '';

  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly projectPath: string,
    public readonly containerId: string,
    public readonly ownerId: string,
    public readonly passwordHash: string,
    dockerManager: DockerManager,
    config?: ServerConfig,
    persistent = false,
    isPublic = false,
    demoDurationMs = 0
  ) {
    this.dockerManager = dockerManager;
    this.terminalManager = new TerminalManager(dockerManager, containerId);
    this.presenceManager = new PresenceManager();
    this.createdAt = new Date();
    this.expiresAt = new Date(this.createdAt.getTime() + DEFAULTS.SESSION_MAX_LIFETIME_MS);
    this.persistent = persistent;
    this.isPublic = isPublic;
    this.isDemo = demoDurationMs > 0;
    this.demoExpiresAt = demoDurationMs > 0 ? new Date(this.createdAt.getTime() + demoDurationMs) : null;
    this.lastActivity = Date.now();

    // Initialize audit logger (requires license)
    if (config?.auditEnabled !== false && config?.dataDir) {
      this.auditLogger = new AuditLogger(config.dataDir, id);
    }

    // Initialize session recorder
    if (config?.recordingEnabled && config?.dataDir) {
      this.recorder = new SessionRecorder(config.dataDir, id);
    }
  }

  isExpired(): boolean {
    return Date.now() >= this.expiresAt.getTime();
  }

  isDemoExpired(): boolean {
    return this.demoExpiresAt !== null && Date.now() >= this.demoExpiresAt.getTime();
  }

  demoRemainingMs(): number {
    if (!this.demoExpiresAt) return Infinity;
    return Math.max(0, this.demoExpiresAt.getTime() - Date.now());
  }

  isIdle(): boolean {
    return Date.now() - this.lastActivity > DEFAULTS.SESSION_IDLE_TIMEOUT_MS;
  }

  touch(): void {
    this.lastActivity = Date.now();
  }

  addUser(user: User): void {
    this.users.set(user.id, user);
  }

  removeUser(userId: string): void {
    this.users.delete(userId);
  }

  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  isUserBanned(userId: string): boolean {
    return this.bannedUsers.has(userId);
  }

  isIpBanned(ip: string): boolean {
    return this.bannedIps.has(ip);
  }

  banUser(userId: string): void {
    this.bannedUsers.add(userId);
  }

  banIp(ip: string): void {
    this.bannedIps.add(ip);
  }

  toInfo(): SessionInfo {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      userCount: this.users.size,
      createdAt: this.createdAt.toISOString(),
      users: Array.from(this.users.values()).map(({ id, name, role }) => ({
        id,
        name,
        role,
      })),
    };
  }
}
