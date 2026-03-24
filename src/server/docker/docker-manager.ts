import Docker from 'dockerode';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { ContainerConfig, TerminalSize } from '../../shared/types';
import { DockerError } from '../../shared/errors';
import { buildContainerOptions, buildExecOptions } from './container-config';
import { DEFAULTS } from '../../shared/constants';
import { createLogger } from '../logger';

const log = createLogger('docker');

export class DockerManager extends EventEmitter {
  private docker: Docker;

  constructor() {
    super();
    this.docker = new Docker();
  }

  async ensureNetwork(): Promise<void> {
    const networkName = DEFAULTS.DOCKER_NETWORK_NAME;
    try {
      const networks = await this.docker.listNetworks({
        filters: { name: [networkName] },
      });
      if (networks.some((n) => n.Name === networkName)) {
        return;
      }
      await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        Internal: false, // allow internet access
        Options: {
          'com.docker.network.bridge.enable_icc': 'false', // no inter-container comms
        },
        Labels: {
          'sharedterminal.managed': 'true',
        },
      });
      log.info('Created isolated network', { network: networkName });
    } catch (err) {
      log.warn('Failed to create network', { network: networkName, error: (err as Error).message });
      // Fall back to bridge if network creation fails
    }
  }

  async createContainer(config: ContainerConfig, sessionId: string): Promise<string> {
    try {
      const options = buildContainerOptions(config, sessionId);
      const container = await this.docker.createContainer(options);
      await container.start();
      return container.id;
    } catch (err) {
      throw new DockerError(`Failed to create container: ${(err as Error).message}`);
    }
  }

  async stopContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: 5 });
    } catch {
      // Container may already be stopped
    }
  }

  async startContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.start();
    } catch (err) {
      throw new DockerError(`Failed to start container: ${(err as Error).message}`);
    }
  }

  async removeContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      try {
        await container.stop({ t: 5 });
      } catch {
        // Container may already be stopped
      }
      await container.remove({ force: true });
    } catch (err) {
      throw new DockerError(`Failed to remove container: ${(err as Error).message}`);
    }
  }

  async removeVolume(volumeName: string): Promise<void> {
    try {
      const volume = this.docker.getVolume(volumeName);
      await volume.remove();
    } catch {
      // Volume may not exist
    }
  }

  async exec(
    containerId: string,
    cols: number,
    rows: number
  ): Promise<{ stream: NodeJS.ReadWriteStream; execId: string }> {
    try {
      const container = this.docker.getContainer(containerId);
      const exec = await container.exec(buildExecOptions(['/bin/bash'], cols, rows));
      const stream = await exec.start({ hijack: true, stdin: true, Tty: true });
      return { stream, execId: exec.id };
    } catch (err) {
      throw new DockerError(`Failed to exec in container: ${(err as Error).message}`);
    }
  }

  async execStream(
    containerId: string,
    cmd: string[]
  ): Promise<PassThrough> {
    try {
      const container = this.docker.getContainer(containerId);
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
      });
      const stream = await exec.start({ hijack: true, stdin: false, Tty: false });
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      this.docker.modem.demuxStream(stream, stdout, stderr);
      stream.on('end', () => {
        stdout.end();
        stderr.end();
      });
      return stdout;
    } catch (err) {
      throw new DockerError(`Failed to exec stream in container: ${(err as Error).message}`);
    }
  }

  async resizeExec(execId: string, size: TerminalSize): Promise<void> {
    try {
      const exec = this.docker.getExec(execId);
      await exec.resize({ h: size.rows, w: size.cols });
    } catch {
      // Resize can fail if exec has ended, safe to ignore
    }
  }

  async isContainerRunning(containerId: string): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      return info.State.Running;
    } catch {
      return false;
    }
  }

  async listManagedContainers(): Promise<Docker.ContainerInfo[]> {
    return this.docker.listContainers({
      all: true,
      filters: {
        label: ['sharedterminal.managed=true'],
      },
    });
  }

  async listManagedNetworks(): Promise<Docker.NetworkInspectInfo[]> {
    const networks = await this.docker.listNetworks({
      filters: {
        label: ['sharedterminal.managed=true'],
      },
    });
    return networks;
  }

  async removeNetwork(networkId: string): Promise<void> {
    try {
      const network = this.docker.getNetwork(networkId);
      await network.remove();
    } catch {
      // Network may be in use or already removed
    }
  }

  /**
   * Copy project files into a named volume by running a temporary container.
   * Used for persistent mode on first start.
   */
  async copyToVolume(
    image: string,
    volumeName: string,
    sourcePath: string,
    destPath: string
  ): Promise<void> {
    try {
      const container = await this.docker.createContainer({
        Image: image,
        Cmd: ['cp', '-a', '/src/.', destPath],
        HostConfig: {
          Binds: [
            `${sourcePath}:/src:ro`,
            `${volumeName}:${destPath}:rw`,
          ],
        },
      });
      await container.start();
      await container.wait();
      await container.remove();
    } catch (err) {
      throw new DockerError(`Failed to copy files to volume: ${(err as Error).message}`);
    }
  }
}
