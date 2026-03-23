export class SharedTerminalError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'SharedTerminalError';
  }
}

export class SessionNotFoundError extends SharedTerminalError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND', 404);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionFullError extends SharedTerminalError {
  constructor() {
    super('Session has reached maximum users', 'SESSION_FULL', 403);
    this.name = 'SessionFullError';
  }
}

export class AuthenticationError extends SharedTerminalError {
  constructor(message = 'Authentication failed') {
    super(message, 'AUTH_FAILED', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends SharedTerminalError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'UNAUTHORIZED', 403);
    this.name = 'AuthorizationError';
  }
}

export class DockerError extends SharedTerminalError {
  constructor(message: string) {
    super(message, 'DOCKER_ERROR', 500);
    this.name = 'DockerError';
  }
}

export class TerminalError extends SharedTerminalError {
  constructor(message: string) {
    super(message, 'TERMINAL_ERROR', 500);
    this.name = 'TerminalError';
  }
}

export class SessionExpiredError extends SharedTerminalError {
  constructor(sessionId: string) {
    super(`Session expired: ${sessionId}. The owner must start a new session.`, 'SESSION_EXPIRED', 410);
    this.name = 'SessionExpiredError';
  }
}
