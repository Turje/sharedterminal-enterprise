import { EventEmitter } from 'events';
import { Role } from '../../shared/types';

export interface PresenceUser {
  id: string;
  name: string;
  role: Role;
  socketId: string;
}

export class PresenceManager extends EventEmitter {
  private users = new Map<string, PresenceUser>();

  addUser(userId: string, name: string, role: Role, socketId: string): void {
    const user: PresenceUser = { id: userId, name, role, socketId };
    this.users.set(userId, user);
    this.emit('joined', { id: userId, name, role });
  }

  removeUser(userId: string): void {
    if (this.users.has(userId)) {
      this.users.delete(userId);
      this.emit('left', userId);
    }
  }

  removeBySocket(socketId: string): void {
    for (const [userId, user] of this.users) {
      if (user.socketId === socketId) {
        this.users.delete(userId);
        this.emit('left', userId);
        return;
      }
    }
  }

  getUsers(): Array<{ id: string; name: string; role: Role }> {
    return Array.from(this.users.values()).map(({ id, name, role }) => ({
      id,
      name,
      role,
    }));
  }

  getUserBySocket(socketId: string): PresenceUser | undefined {
    for (const user of this.users.values()) {
      if (user.socketId === socketId) return user;
    }
    return undefined;
  }

  get count(): number {
    return this.users.size;
  }

  clear(): void {
    this.users.clear();
  }
}
