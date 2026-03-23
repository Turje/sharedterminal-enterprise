import fs from 'fs';
import net from 'net';
import https from 'https';
import http from 'http';
import { loadConfig } from './config';
import { createApp } from './app';
import { createSocketServer } from './socket';
import { SessionManager } from './session/session-manager';
import { TokenStore } from './auth/token';
import { startTunnel, stopTunnel } from './tunnel';
import { startupCleanup, setupGracefulShutdown } from './docker/cleanup';
import { createLogger } from './logger';

const log = createLogger('server');

function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(startPort, '0.0.0.0', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', () => {
      if (startPort < 65535) {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(new Error('No available ports'));
      }
    });
  });
}

async function main() {
  const config = loadConfig();
  config.port = await findAvailablePort(config.port);
  const tokenStore = new TokenStore();
  const sessionManager = new SessionManager(config, tokenStore);

  // Startup cleanup: handle orphaned containers from ungraceful shutdown
  const dockerManager = sessionManager.getDockerManager();
  await startupCleanup(dockerManager);

  // Ensure isolated Docker network exists
  await dockerManager.ensureNetwork();

  const app = createApp(sessionManager, tokenStore, config);

  let server: http.Server | https.Server;

  // Try TLS, fall back to HTTP
  if (fs.existsSync(config.tlsCertPath) && fs.existsSync(config.tlsKeyPath)) {
    const cert = fs.readFileSync(config.tlsCertPath);
    const key = fs.readFileSync(config.tlsKeyPath);
    server = https.createServer({ cert, key }, app);
    log.info('TLS enabled');
  } else {
    server = http.createServer(app);
    log.info('Running without TLS (development mode)');
  }

  createSocketServer(server, sessionManager, tokenStore, config);

  // Graceful shutdown with cleanup
  setupGracefulShutdown(async () => {
    stopTunnel();
    await sessionManager.shutdown();
    server.close();
  });

  server.listen(config.port, config.host, async () => {
    const protocol = server instanceof https.Server ? 'https' : 'http';

    if (config.selfHosted) {
      log.info('Self-hosted mode — tunnel disabled');
      const url = config.serverUrl || `${protocol}://${config.host}:${config.port}`;
      log.info('SharedTerminal Enterprise running', { url });
    } else {
      log.info('SharedTerminal Enterprise running', { url: `${protocol}://${config.host}:${config.port}` });

      const tunnelUrl = await startTunnel(config.port);
      if (tunnelUrl) {
        sessionManager.setTunnelUrl(tunnelUrl);
        log.info('Tunnel active', { url: tunnelUrl });
      }
    }
  });
}

main().catch((err) => {
  log.error('Fatal error', { error: (err as Error).message });
  process.exit(1);
});
