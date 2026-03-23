export const DEFAULTS = {
  PORT: 3000,
  HOST: '0.0.0.0',
  DOCKER_IMAGE: 'sharedterminal:latest',
  CONTAINER_MEMORY_LIMIT: 512 * 1024 * 1024, // 512MB
  CONTAINER_PID_LIMIT: 256,
  SESSION_IDLE_TIMEOUT_MS: 60 * 60 * 1000, // 1 hour
  SESSION_MAX_LIFETIME_MS: 12 * 60 * 60 * 1000, // 12 hours
  TERMINAL_COLS: 80,
  TERMINAL_ROWS: 24,
  RATE_LIMIT_WINDOW_MS: 60 * 1000,
  RATE_LIMIT_MAX_REQUESTS: 100,
  INPUT_THROTTLE_MS: 10,
  TOKEN_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  MAX_TABS_PER_USER: 5,
  // v2 enterprise defaults
  SCROLLBACK_MAX_LINES: 1000,
  AUDIT_MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  AUDIT_MAX_ROTATED_FILES: 5,
  DLP_ENABLED: true,
  RECORDING_ENABLED: true,
  TUNNEL_ENABLED: true,
  DOCKER_NETWORK_NAME: 'sharedterm-isolated',
} as const;

export const EVENTS = {
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_OUTPUT: 'terminal:output',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_EXIT: 'terminal:exit',
  PRESENCE_JOINED: 'presence:joined',
  PRESENCE_LEFT: 'presence:left',
  PRESENCE_LIST: 'presence:list',
  PRESENCE_UPDATE: 'presence:update',
  SESSION_ERROR: 'session:error',
  SESSION_STOPPED: 'session:stopped',
} as const;

export const API_ROUTES = {
  CREATE: '/api/session/create',
  JOIN: '/api/session/join',
  STOP: '/api/session/stop',
  STATUS: '/api/session/status',
  HEALTH: '/api/health',
  KICK: '/api/session/kick',
  ADMIN_SESSIONS: '/api/admin/sessions',
  ADMIN_AUDIT: '/api/admin/audit',
  ADMIN_RECORDINGS: '/api/admin/recordings',
} as const;
