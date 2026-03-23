import fs from 'fs';
import path from 'path';
import os from 'os';
import { DockerManager } from './docker-manager';
import { createLogger } from '../logger';

const log = createLogger('cleanup');

const PID_DIR = path.join(os.homedir(), '.sharedterminal', 'data');
const PID_FILE = path.join(PID_DIR, 'sharedterminal.pid');

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function writePidFile(): void {
  fs.mkdirSync(PID_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));
}

export function removePidFile(): void {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    // File may not exist
  }
}

/**
 * On startup, check if the previous instance died ungracefully.
 * If so, clean up orphaned Docker containers and networks.
 */
export async function startupCleanup(dockerManager: DockerManager): Promise<void> {
  try {
    if (fs.existsSync(PID_FILE)) {
      const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
      if (!isNaN(oldPid) && !isProcessRunning(oldPid)) {
        log.info('Previous process died ungracefully, cleaning up orphaned containers');
        await cleanupOrphanedContainers(dockerManager);
        await cleanupOrphanedNetworks(dockerManager);
      }
    }
  } catch (err) {
    log.warn('Startup cleanup error', { error: (err as Error).message });
  }
  writePidFile();
}

async function cleanupOrphanedContainers(dockerManager: DockerManager): Promise<void> {
  try {
    const containers = await dockerManager.listManagedContainers();
    for (const container of containers) {
      const id = container.Id;
      const sessionLabel = container.Labels?.['sharedterminal.session'] || 'unknown';
      const isPersistent = container.Labels?.['sharedterminal.persistent'] === 'true';

      if (isPersistent) {
        log.info('Stopping persistent container', { session: sessionLabel });
        await dockerManager.stopContainer(id);
      } else {
        log.info('Removing orphaned container', { session: sessionLabel });
        await dockerManager.removeContainer(id);
      }
    }
  } catch (err) {
    log.warn('Failed to clean containers', { error: (err as Error).message });
  }
}

async function cleanupOrphanedNetworks(dockerManager: DockerManager): Promise<void> {
  try {
    const networks = await dockerManager.listManagedNetworks();
    for (const network of networks) {
      if (network.Name && network.Id) {
        log.info('Removing orphaned network', { network: network.Name });
        await dockerManager.removeNetwork(network.Id);
      }
    }
  } catch (err) {
    log.warn('Failed to clean networks', { error: (err as Error).message });
  }
}

export function setupGracefulShutdown(onShutdown: () => Promise<void>): void {
  const handler = async (signal: string) => {
    log.info('Received signal, shutting down', { signal });
    removePidFile();
    await onShutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => handler('SIGINT'));
  process.on('SIGTERM', () => handler('SIGTERM'));

  process.on('uncaughtException', (err) => {
    log.error('Uncaught exception', { error: err.message, stack: err.stack });
    removePidFile();
    process.exit(1);
  });
}
