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
  | 'auth.admin_pin_failure'
  | 'auth.admin_rejoin'
  | 'ai.request'
  | 'ai.response'
  | 'security.dlp_detected'
  | 'user.kicked'
  | 'user.banned'
  | 'workspace.exported'
  | 'history.exported';

export interface AuditEvent {
  ts: string;
  type: AuditEventType;
  sessionId: string;
  userId?: string;
  userName?: string;
  ip?: string;
  data?: Record<string, unknown>;
  /** SHA-256 hash of (previousHash + this event), forming a tamper-evident chain */
  hash?: string;
  /** Hash of the previous entry in the chain */
  prevHash?: string;
}
