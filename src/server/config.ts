import os from 'os';
import path from 'path';
import { DEFAULTS } from '../shared/constants';

export interface ServerConfig {
  port: number;
  host: string;
  nodeEnv: string;
  tlsCertPath: string;
  tlsKeyPath: string;
  dockerImage: string;
  containerMemoryLimit: number;
  containerPidLimit: number;
  sessionIdleTimeoutMs: number;
  anthropicApiKey: string;
  // v2 enterprise fields
  tunnelEnabled: boolean;
  serverUrl: string;
  dataDir: string;
  recordingEnabled: boolean;
  dlpEnabled: boolean;
  selfHosted: boolean;
  // SSO / OIDC
  ssoEnabled: boolean;
  ssoIssuerUrl: string;
  ssoClientId: string;
  ssoClientSecret: string;
  ssoCallbackUrl: string;
  ssoAllowedDomains: string[];
  ssoPasswordFallback: boolean; // allow password join when SSO is enabled
}

export function loadConfig(): ServerConfig {
  const tunnelEnabled = process.env.TUNNEL_ENABLED !== 'false';
  const serverUrl = process.env.SERVER_URL || '';
  const dataDir = process.env.DATA_DIR || path.join(os.homedir(), '.sharedterminal', 'data');

  const ssoEnabled = process.env.SSO_ENABLED === 'true';
  const ssoAllowedDomains = process.env.SSO_ALLOWED_DOMAINS
    ? process.env.SSO_ALLOWED_DOMAINS.split(',').map((d) => d.trim()).filter(Boolean)
    : [];

  return {
    port: parseInt(process.env.PORT || String(DEFAULTS.PORT), 10),
    host: process.env.HOST || DEFAULTS.HOST,
    nodeEnv: process.env.NODE_ENV || 'development',
    tlsCertPath: process.env.TLS_CERT_PATH || path.join(process.cwd(), 'certs', 'cert.pem'),
    tlsKeyPath: process.env.TLS_KEY_PATH || path.join(process.cwd(), 'certs', 'key.pem'),
    dockerImage: process.env.DOCKER_IMAGE || DEFAULTS.DOCKER_IMAGE,
    containerMemoryLimit: parseInt(
      process.env.CONTAINER_MEMORY_LIMIT || String(DEFAULTS.CONTAINER_MEMORY_LIMIT),
      10
    ),
    containerPidLimit: parseInt(
      process.env.CONTAINER_PID_LIMIT || String(DEFAULTS.CONTAINER_PID_LIMIT),
      10
    ),
    sessionIdleTimeoutMs: parseInt(
      process.env.SESSION_IDLE_TIMEOUT_MS || String(DEFAULTS.SESSION_IDLE_TIMEOUT_MS),
      10
    ),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    tunnelEnabled,
    serverUrl,
    dataDir,
    recordingEnabled: process.env.RECORDING_ENABLED !== 'false',
    dlpEnabled: process.env.DLP_ENABLED !== 'false',
    selfHosted: !tunnelEnabled,
    // SSO
    ssoEnabled,
    ssoIssuerUrl: process.env.SSO_ISSUER_URL || '',
    ssoClientId: process.env.SSO_CLIENT_ID || '',
    ssoClientSecret: process.env.SSO_CLIENT_SECRET || '',
    ssoCallbackUrl: process.env.SSO_CALLBACK_URL || '',
    ssoAllowedDomains,
    ssoPasswordFallback: process.env.SSO_PASSWORD_FALLBACK !== 'false',
  };
}
