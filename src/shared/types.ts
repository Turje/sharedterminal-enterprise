export type Role = 'owner' | 'editor' | 'viewer';

export interface User {
  id: string;
  name: string;
  role: Role;
  token: string;
  connectedAt: Date;
}

export interface SessionConfig {
  projectPath: string;
  name?: string;
  ownerName: string;
  password: string;
  allowGitPush?: boolean;
  readOnly?: boolean;
  persistent?: boolean;
  isPublic?: boolean;
}

export interface Session {
  id: string;
  name: string;
  projectPath: string;
  containerId: string;
  ownerId: string;
  passwordHash: string;
  users: Map<string, User>;
  createdAt: Date;
  status: SessionStatus;
}

export type SessionStatus = 'creating' | 'running' | 'stopping' | 'stopped';

export interface SessionInfo {
  id: string;
  name: string;
  status: SessionStatus;
  userCount: number;
  createdAt: string;
  users: Array<{ id: string; name: string; role: Role }>;
}

export interface TerminalInstance {
  id: string;
  userId: string;
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface TokenPayload {
  token: string;
  sessionId: string;
  userId: string;
  role: Role;
  createdAt: number;
  expiresAt: number;
}

export interface ContainerConfig {
  image: string;
  workspacePath: string;
  memoryLimit: number;
  pidLimit: number;
  allowGitPush?: boolean;
  readOnly?: boolean;
  persistent?: boolean;
  sessionId?: string;
}

export interface ActivityUpdate {
  userId: string;
  userName: string;
  activity: string;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: string;
}

// Socket.IO event types
export interface ClientToServerEvents {
  'terminal:input': (data: { tabId: string; input: string }) => void;
  'terminal:resize': (data: { tabId: string; size: TerminalSize }) => void;
  'terminal:create': () => void;
  'terminal:close': (tabId: string) => void;
  'presence:update': (data: { name: string }) => void;
  'activity:update': (activity: string) => void;
  'chat:send': (message: string) => void;
  'follow:start': (targetUserId: string) => void;
  'follow:stop': () => void;
  'ai:ask': (data: { message: string; apiKey: string }) => void;
  'summary:request': (apiKey: string) => void;
  'terminal:sync': (tabId: string) => void;
  'user:kick': (userId: string) => void;
  'user:ban': (userId: string) => void;
}

export interface ServerToClientEvents {
  'terminal:output': (data: { tabId: string; output: string }) => void;
  'terminal:exit': (data: { tabId: string; code: number }) => void;
  'terminal:created': (data: { tabId: string; index: number }) => void;
  'terminal:closed': (tabId: string) => void;
  'presence:joined': (user: { id: string; name: string; role: Role }) => void;
  'presence:left': (userId: string) => void;
  'presence:list': (users: Array<{ id: string; name: string; role: Role }>) => void;
  'activity:feed': (activities: ActivityUpdate[]) => void;
  'chat:message': (message: ChatMessage) => void;
  'chat:history': (messages: ChatMessage[]) => void;
  'session:error': (message: string) => void;
  'session:stopped': () => void;
  'follow:data': (data: { userId: string; userName: string; output: string }) => void;
  'follow:ended': (reason: string) => void;
  'ai:response': (data: { message: string; id: string }) => void;
  'ai:stream': (data: { chunk: string; id: string }) => void;
  'ai:error': (error: string) => void;
  'summary:response': (summary: string) => void;
  'terminal:sync': (data: { tabId: string; scrollback: string }) => void;
  'security:warning': (message: string) => void;
  'user:kicked': (reason: string) => void;
  'user:banned': (reason: string) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  userId: string;
  sessionId: string;
  role: Role;
  name: string;
}

// API request/response types
export interface CreateSessionRequest {
  projectPath: string;
  name?: string;
  ownerName: string;
  password: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  token: string;
  url: string;
}

export interface JoinSessionRequest {
  sessionId: string;
  password: string;
  name: string;
}

export interface JoinSessionResponse {
  sessionId: string;
  sessionName: string;
  token: string;
  url: string;
  role: Role;
}

export interface SessionStatusResponse {
  session: SessionInfo;
}

export interface ErrorResponse {
  error: string;
  code?: string;
}
