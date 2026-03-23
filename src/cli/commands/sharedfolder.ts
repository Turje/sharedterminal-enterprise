import net from 'net';
import path from 'path';
import os from 'os';
import fs from 'fs';
import http from 'http';
import https from 'https';
import readline from 'readline';
import express from 'express';
import { execSync } from 'child_process';
import { loadConfig } from '../../server/config';
import { createApp } from '../../server/app';
import { createSocketServer } from '../../server/socket';
import { SessionManager } from '../../server/session/session-manager';
import { TokenStore } from '../../server/auth/token';
import { startTunnel, stopTunnel } from '../../server/tunnel';
import { generatePassword } from '../../shared/utils';
import { startupCleanup, removePidFile, writePidFile } from '../../server/docker/cleanup';

// Session file path — written to project dir so `chat` command can find the running session
export const SESSION_FILE_NAME = '.sharedterminal.json';

export interface SessionFileData {
  port: number;
  sessionId: string;
  ownerName: string;
  projectPath: string;
}

// ANSI color codes
const ACCENT = '\x1b[38;2;218;119;86m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(startPort, '0.0.0.0', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', () => {
      // Port in use, try next
      if (startPort < 65535) {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(new Error('No available ports'));
      }
    });
  });
}

function checkDocker(): void {
  try {
    execSync('docker info', { stdio: 'pipe' });
  } catch {
    console.error('\n  Error: Docker is not running.\n');
    console.error('  Please start Docker Desktop or the Docker daemon and try again.');
    console.error('  Install Docker: https://docs.docker.com/get-docker/\n');
    process.exit(1);
  }

  try {
    execSync('docker image inspect sharedterminal:latest', { stdio: 'pipe' });
  } catch {
    const packageRoot = path.resolve(__dirname, '..', '..', '..');
    const dockerfilePath = path.join(packageRoot, 'docker', 'Dockerfile');

    if (!fs.existsSync(dockerfilePath)) {
      console.error('\n  Error: Docker image "sharedterminal:latest" not found.\n');
      console.error('  Dockerfile not found at expected path:');
      console.error(`    ${dockerfilePath}\n`);
      process.exit(1);
    }

    console.log(`\n  ${ACCENT}Building SharedTerminal Docker image (first-time setup)...${RESET}\n`);
    try {
      execSync(`docker build -t sharedterminal:latest -f ${dockerfilePath} ${packageRoot}`, {
        stdio: 'inherit',
      });
      console.log(`\n  ${ACCENT}Docker image built successfully.${RESET}\n`);
    } catch {
      console.error('\n  Error: Failed to build Docker image.\n');
      console.error('  Please try building manually:');
      console.error('    npm run docker:build\n');
      process.exit(1);
    }
  }
}

function copyToClipboard(text: string): boolean {
  try {
    const platform = process.platform;
    if (platform === 'darwin') {
      execSync('pbcopy', { input: text, stdio: ['pipe', 'pipe', 'pipe'] });
    } else if (platform === 'linux') {
      execSync('xclip -selection clipboard', { input: text, stdio: ['pipe', 'pipe', 'pipe'] });
    } else if (platform === 'win32') {
      execSync('clip', { input: text, stdio: ['pipe', 'pipe', 'pipe'] });
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function runSharedfolder(options: {
  path?: string;
  password?: string;
  name?: string;
  git?: boolean;
  readOnly?: boolean;
  persistent?: boolean;
  serverUrl?: string;
}) {
  checkDocker();

  const config = loadConfig();

  // Override config with CLI flags
  if (options.serverUrl) {
    config.serverUrl = options.serverUrl;
    config.tunnelEnabled = false;
    config.selfHosted = true;
  }

  // Find an available port starting from the configured one
  const port = await findAvailablePort(config.port);
  config.port = port;

  const tokenStore = new TokenStore();
  const sessionManager = new SessionManager(config, tokenStore);

  // Startup cleanup
  const dockerManager = sessionManager.getDockerManager();
  await startupCleanup(dockerManager);
  await dockerManager.ensureNetwork();

  const app = createApp(sessionManager, tokenStore, config);

  let server: http.Server | https.Server;

  if (fs.existsSync(config.tlsCertPath) && fs.existsSync(config.tlsKeyPath)) {
    const cert = fs.readFileSync(config.tlsCertPath);
    const key = fs.readFileSync(config.tlsKeyPath);
    server = https.createServer({ cert, key }, app);
  } else {
    server = http.createServer(app);
  }

  const { chatBridge } = createSocketServer(server, sessionManager, tokenStore, config);

  const projectPath = path.resolve(options.path || process.cwd());
  const password = options.password || generatePassword();
  const sessionName = options.name || path.basename(projectPath);
  const ownerName = os.userInfo().username;

  // Start server on the available port
  await new Promise<void>((resolve) => {
    server.listen(port, config.host, () => resolve());
  });

  // Write PID file
  writePidFile();

  // Open tunnel (unless self-hosted)
  let tunnelUrl: string | null = null;
  if (config.tunnelEnabled) {
    tunnelUrl = await startTunnel(port);
    if (tunnelUrl) {
      sessionManager.setTunnelUrl(tunnelUrl);
    }
  } else {
    console.log(`\n  ${DIM}Self-hosted mode — tunnel disabled${RESET}`);
  }

  // Create session
  const { session } = await sessionManager.createSession({
    projectPath,
    name: sessionName,
    ownerName,
    password,
    allowGitPush: options.git || false,
    readOnly: options.readOnly || false,
    persistent: options.persistent || false,
  });

  const hostUserId = 'host-owner';

  // Add owner to presence so teammates see them as online
  session.presenceManager.addUser(hostUserId, ownerName, 'owner', 'host-local');

  // HTTP endpoint for host to send chat messages (used by `sharedterminal chat`)
  app.post('/api/host/chat', express.json(), (req, res) => {
    const { message, sessionId: sid } = req.body;
    if (typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'message required' });
      return;
    }
    if (sid !== session.id) {
      res.status(403).json({ error: 'invalid session' });
      return;
    }
    chatBridge.send(session.id, hostUserId, ownerName, message);
    res.json({ ok: true });
  });

  // HTTP endpoint to get incoming messages (polling for `sharedterminal chat`)
  const pendingHostMessages: Array<{ userName: string; message: string; timestamp: string }> = [];
  chatBridge.onMessage((msg) => {
    if (msg.userId === hostUserId) return;
    pendingHostMessages.push({ userName: msg.userName, message: msg.message, timestamp: msg.timestamp });
    // Keep max 50 pending
    if (pendingHostMessages.length > 50) pendingHostMessages.shift();
  });

  app.get('/api/host/messages', (req, res) => {
    const sid = req.query.sessionId as string;
    if (sid !== session.id) {
      res.status(403).json({ error: 'invalid session' });
      return;
    }
    const msgs = pendingHostMessages.splice(0);
    res.json({ messages: msgs });
  });

  // Write session file so `sharedterminal chat` can discover the running session
  const sessionFilePath = path.join(projectPath, SESSION_FILE_NAME);
  const sessionFileData: SessionFileData = { port, sessionId: session.id, ownerName, projectPath };
  fs.writeFileSync(sessionFilePath, JSON.stringify(sessionFileData, null, 2));

  const baseUrl = sessionManager.getBaseUrl();
  const url = `${baseUrl}/?session=${session.id}&name=${encodeURIComponent(sessionName)}`;

  const mode = options.readOnly ? 'read-only' : options.git ? 'read-write + git push' : 'read-write';
  const persistentLabel = options.persistent ? ' (persistent)' : '';
  const selfHosted = !config.tunnelEnabled;

  // Copy URL to clipboard
  const copied = copyToClipboard(url);
  const clipboardHint = copied ? ` ${DIM}(copied to clipboard)${RESET}` : '';

  const GREEN = '\x1b[32m';
  const YELLOW = '\x1b[33m';

  // Enterprise output
  const separator = `${DIM}${'─'.repeat(56)}${RESET}`;
  const modeLabel = selfHosted ? 'Self-Hosted Mode' : 'Tunnel Mode';

  console.log('');
  console.log(`  ${GREEN}●${RESET} ${ACCENT}${BOLD}SharedTerminal Enterprise${RESET} ${DIM}[${modeLabel}]${RESET}`);
  console.log(`  ${separator}`);
  console.log('');
  console.log(`  ${DIM}Secure Sandbox:${RESET}  ${GREEN}●${RESET} Active ${DIM}(Isolated Network, Read-Only RootFS)${RESET}`);
  console.log(`  ${DIM}Audit Logging:${RESET}   ${GREEN}●${RESET} Active ${DIM}(Writing to ${config.dataDir}/audit/)${RESET}`);
  console.log(`  ${DIM}DLP Scanner:${RESET}     ${config.dlpEnabled ? `${GREEN}●${RESET} Active ${DIM}(Redacting secrets)${RESET}` : `${YELLOW}●${RESET} Disabled`}`);
  console.log(`  ${DIM}Recording:${RESET}       ${config.recordingEnabled ? `${GREEN}●${RESET} Active ${DIM}(asciicast v2)${RESET}` : `${YELLOW}●${RESET} Disabled`}`);
  if (options.persistent) {
    console.log(`  ${DIM}Persistence:${RESET}     ${GREEN}●${RESET} Active ${DIM}(State survives disconnects)${RESET}`);
  }
  console.log('');
  console.log(`  ${separator}`);
  console.log('');
  console.log(`  ${DIM}Invite Link:${RESET}  ${ACCENT}${BOLD}${url}${RESET}${clipboardHint}`);
  console.log(`  ${DIM}Session PIN:${RESET}  ${BOLD}${password}${RESET}`);
  console.log('');
  console.log(`  ${separator}`);
  console.log('');
  console.log(`  ${DIM}Project${RESET}   ${projectPath}`);
  console.log(`  ${DIM}Mode${RESET}      ${mode}${persistentLabel}`);
  console.log('');
  console.log(`  ${DIM}Waiting for teammates to join...${RESET}`);
  console.log(`  ${DIM}Type a message below to chat, or Ctrl+C to stop.${RESET}`);
  console.log('');

  // Start host chat via readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `  ${ACCENT}>${RESET} `,
  });

  // Show incoming messages from teammates
  chatBridge.onMessage((msg) => {
    if (msg.userId === hostUserId) return;
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    console.log(`  ${DIM}[chat]${RESET} ${ACCENT}${msg.userName}${RESET}: ${msg.message}`);
    rl.prompt(true);
  });

  rl.prompt();

  rl.on('line', (line) => {
    const text = line.trim();
    if (text) {
      chatBridge.send(session.id, hostUserId, ownerName, text);
    }
    rl.prompt();
  });

  // Graceful shutdown
  const shutdown = async () => {
    rl.close();
    // Remove session file
    try { fs.unlinkSync(sessionFilePath); } catch {}
    // Remove owner from presence
    session.presenceManager.removeBySocket('host-local');
    console.log('');
    console.log(`  ${ACCENT}Shutting down...${RESET}`);
    stopTunnel();
    removePidFile();
    await sessionManager.shutdown();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
