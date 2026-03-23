import { describe, it, expect } from 'vitest';
import {
  SharedTerminalError,
  SessionNotFoundError,
  AuthenticationError,
  AuthorizationError,
  DockerError,
} from '../../src/shared/errors';

describe('Custom errors', () => {
  it('should create SharedTerminalError', () => {
    const err = new SharedTerminalError('test', 'TEST_CODE', 400);
    expect(err.message).toBe('test');
    expect(err.code).toBe('TEST_CODE');
    expect(err.statusCode).toBe(400);
    expect(err).toBeInstanceOf(Error);
  });

  it('should create SessionNotFoundError', () => {
    const err = new SessionNotFoundError('abc-123');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('SESSION_NOT_FOUND');
    expect(err.message).toContain('abc-123');
  });

  it('should create AuthenticationError', () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
  });

  it('should create AuthorizationError', () => {
    const err = new AuthorizationError();
    expect(err.statusCode).toBe(403);
  });

  it('should create DockerError', () => {
    const err = new DockerError('container failed');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('DOCKER_ERROR');
  });
});
