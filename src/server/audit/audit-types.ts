export type AuditEventType =
  | 'session.created'
  | 'session.joined'
  | 'session.left'
  | 'session.stopped'
  | 'terminal.input'
  | 'terminal.created'
  | 'terminal.closed'
  | 'chat.message'
  | 'auth.success'
  | 'auth.failure'
  | 'auth.lockout'
  | 'ai.request'
  | 'ai.response'
  | 'security.dlp_detected'
  | 'user.kicked'
  | 'user.banned';

export interface AuditEvent {
  ts: string;
  type: AuditEventType;
  sessionId: string;
  userId?: string;
  userName?: string;
  ip?: string;
  data?: Record<string, unknown>;
}
