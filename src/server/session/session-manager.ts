import path from 'path';
import { SessionConfig, Role, User } from '../../shared/types';
import { SessionNotFoundError, SessionExpiredError, AuthenticationError } from '../../shared/errors';
import { generateId } from '../../shared/utils';
import { DockerManager } from '../docker/docker-manager';
import { TokenStore } from '../auth/token';
import { hashPassword, verifyPassword } from '../auth/password';
import { SessionState } from './session';
import { PersistentStore, PersistentSessionRecord } from './persistent-store';
import { ServerConfig } from '../config';

export class SessionManager {
  private sessions = new Map<string, SessionState>();
  private dockerManager: DockerManager;
  private tokenStore: TokenStore;
  private tunnelUrl: string | null = null;
  private persistentStore: PersistentStore;

  constructor(
    private config: ServerConfig,
    tokenStore: TokenStore
  ) {
    this.dockerManager = new DockerManager();
    this.tokenStore = tokenStore;
    this.persistentStore = new PersistentStore(config.dataDir);
  }

  getDockerManager(): DockerManager {
    return this.dockerManager;
  }

  setTunnelUrl(url: string): void {
    this.tunnelUrl = url;
  }

  getBaseUrl(): string {
    if (this.config.serverUrl) {
      return this.config.serverUrl;
    }
    if (this.tunnelUrl) {
      return this.tunnelUrl;
    }
    const host = this.config.host === '0.0.0.0' ? 'localhost' : this.config.host;
    return `https://${host}:${this.config.port}`;
  }

  async createSession(sessionConfig: SessionConfig): Promise<{ session: SessionState; token: string }> {
    const sessionId = generateId();
    const ownerId = generateId();
    const projectPath = path.resolve(sessionConfig.projectPath);
    const persistent = sessionConfig.persistent || false;

    const containerId = await this.dockerManager.createContainer(
      {
        image: this.config.dockerImage,
        workspacePath: projectPath,
        memoryLimit: this.config.containerMemoryLimit,
        pidLimit: this.config.containerPidLimit,
        allowGitPush: sessionConfig.allowGitPush,
        readOnly: sessionConfig.readOnly,
        persistent,
        sessionId,
      },
      sessionId
    );

    // For persistent mode on first run, copy project files into the volume
    if (persistent) {
      await this.dockerManager.copyToVolume(
        this.config.dockerImage,
        `sharedterm-${sessionId}`,
        projectPath,
        '/workspace'
      );
      // Save persistent session record
      this.persistentStore.saveSession({
        sessionId,
        containerId,
        volumeName: `sharedterm-${sessionId}`,
        homeVolumeName: `sharedterm-${sessionId}-home`,
        projectPath,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      });
    }

    const isPublic = sessionConfig.isPublic || false;
    const pHash = isPublic ? '' : await hashPassword(sessionConfig.password);

    const session = new SessionState(
      sessionId,
      sessionConfig.name || path.basename(projectPath),
      projectPath,
      containerId,
      ownerId,
      pHash,
      this.dockerManager,
      this.config,
      persistent,
      isPublic
    );

    const owner: User = {
      id: ownerId,
      name: sessionConfig.ownerName,
      role: 'owner',
      token: '',
      connectedAt: new Date(),
    };

    const token = this.tokenStore.create(sessionId, ownerId, 'owner');
    owner.token = token;
    session.addUser(owner);
    session.status = 'running';

    this.sessions.set(sessionId, session);
    return { session, token };
  }

  async resumeSession(
    sessionId: string,
    password: string,
    ownerName: string
  ): Promise<{ session: SessionState; token: string } | null> {
    const record = this.persistentStore.getSession(sessionId);
    if (!record) return null;

    // Start the existing container
    const running = await this.dockerManager.isContainerRunning(record.containerId);
    if (!running) {
      await this.dockerManager.startContainer(record.containerId);
    }

    this.persistentStore.updateLastAccessed(sessionId);

    const pHash = await hashPassword(password);
    const ownerId = generateId();

    const session = new SessionState(
      sessionId,
      path.basename(record.projectPath),
      record.projectPath,
      record.containerId,
      ownerId,
      pHash,
      this.dockerManager,
      this.config,
      true
    );

    const owner: User = {
      id: ownerId,
      name: ownerName,
      role: 'owner',
      token: '',
      connectedAt: new Date(),
    };

    const token = this.tokenStore.create(sessionId, ownerId, 'owner');
    owner.token = token;
    session.addUser(owner);
    session.status = 'running';

    this.sessions.set(sessionId, session);
    return { session, token };
  }

  async authenticateAndJoin(sessionId: string, password: string, userName: string): Promise<{ token: string; userId: string }> {
    const session = this.getSession(sessionId);
    const valid = await verifyPassword(password, session.passwordHash);
    if (!valid) {
      throw new AuthenticationError('Invalid password');
    }
    return this.generateJoinToken(sessionId, userName);
  }

  generateJoinToken(sessionId: string, userName: string, role: Role = 'editor'): { token: string; userId: string } {
    const session = this.getSession(sessionId);
    const userId = generateId();

    const user: User = {
      id: userId,
      name: userName,
      role,
      token: '',
      connectedAt: new Date(),
    };

    const token = this.tokenStore.create(sessionId, userId, role);
    user.token = token;
    session.addUser(user);

    return { token, userId };
  }

  getSession(sessionId: string): SessionState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    if (session.isExpired()) {
      this.stopSession(sessionId).catch(() => {});
      throw new SessionExpiredError(sessionId);
    }
    return session;
  }

  getSessionByToken(token: string): SessionState {
    const payload = this.tokenStore.validate(token);
    return this.getSession(payload.sessionId);
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'stopping';
    session.terminalManager.destroyAll();
    session.presenceManager.clear();

    if (session.persistent) {
      // Persistent: stop but don't destroy
      await this.dockerManager.stopContainer(session.containerId);
    } else {
      await this.dockerManager.removeContainer(session.containerId);
    }

    // Close audit logger if present
    session.auditLogger?.close();

    this.tokenStore.revokeBySession(sessionId);
    session.status = 'stopped';
    this.sessions.delete(sessionId);
  }

  async destroySession(sessionId: string): Promise<void> {
    // Stop active session first
    if (this.sessions.has(sessionId)) {
      await this.stopSession(sessionId);
    }

    const record = this.persistentStore.getSession(sessionId);
    if (record) {
      // Remove container and volumes
      try { await this.dockerManager.removeContainer(record.containerId); } catch {}
      await this.dockerManager.removeVolume(record.volumeName);
      await this.dockerManager.removeVolume(record.homeVolumeName);
      this.persistentStore.removeSession(sessionId);
    }
  }

  listSessions() {
    return Array.from(this.sessions.values()).map((s) => s.toInfo());
  }

  findPublicSession(): SessionState | null {
    for (const session of this.sessions.values()) {
      if (session.isPublic && session.status === 'running') {
        return session;
      }
    }
    return null;
  }

  listPersistentSessions(): PersistentSessionRecord[] {
    return this.persistentStore.listSessions();
  }

  async shutdown(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    await Promise.allSettled(ids.map((id) => this.stopSession(id)));
  }
}
