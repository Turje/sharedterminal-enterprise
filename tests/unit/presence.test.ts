import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PresenceManager } from '../../src/server/presence/presence-manager';

describe('PresenceManager', () => {
  let presence: PresenceManager;

  beforeEach(() => {
    presence = new PresenceManager();
  });

  it('should add and list users', () => {
    presence.addUser('u1', 'Alice', 'owner', 's1');
    presence.addUser('u2', 'Bob', 'editor', 's2');

    const users = presence.getUsers();
    expect(users).toHaveLength(2);
    expect(users[0]).toEqual({ id: 'u1', name: 'Alice', role: 'owner' });
  });

  it('should remove user by id', () => {
    presence.addUser('u1', 'Alice', 'owner', 's1');
    presence.removeUser('u1');
    expect(presence.count).toBe(0);
  });

  it('should remove user by socket id', () => {
    presence.addUser('u1', 'Alice', 'owner', 'socket-123');
    presence.removeBySocket('socket-123');
    expect(presence.count).toBe(0);
  });

  it('should emit joined event', () => {
    const handler = vi.fn();
    presence.on('joined', handler);
    presence.addUser('u1', 'Alice', 'owner', 's1');
    expect(handler).toHaveBeenCalledWith({ id: 'u1', name: 'Alice', role: 'owner' });
  });

  it('should emit left event', () => {
    const handler = vi.fn();
    presence.on('left', handler);
    presence.addUser('u1', 'Alice', 'owner', 's1');
    presence.removeUser('u1');
    expect(handler).toHaveBeenCalledWith('u1');
  });

  it('should clear all users', () => {
    presence.addUser('u1', 'Alice', 'owner', 's1');
    presence.addUser('u2', 'Bob', 'editor', 's2');
    presence.clear();
    expect(presence.count).toBe(0);
  });
});
