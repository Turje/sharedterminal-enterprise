import os from 'os';
import fs from 'fs';
import path from 'path';
import { ContainerConfig } from '../../shared/types';

function getGitBinds(): string[] {
  const home = os.homedir();
  const binds: string[] = [];

  const gitconfig = path.join(home, '.gitconfig');
  if (fs.existsSync(gitconfig)) {
    binds.push(`${gitconfig}:/home/developer/.gitconfig:ro`);
  }

  const sshDir = path.join(home, '.ssh');
  if (fs.existsSync(sshDir)) {
    binds.push(`${sshDir}:/home/developer/.ssh:ro`);
  }

  return binds;
}

export function buildContainerOptions(config: ContainerConfig, sessionId: string) {
  const workspaceMode = config.readOnly ? 'ro' : 'rw';

  // Persistent mode uses named volumes instead of host bind mounts
  const binds: string[] = [];
  const volumes: Record<string, Record<string, never>> = {};

  if (config.persistent) {
    // Named volumes for workspace and home dir
    volumes[`sharedterm-${sessionId}`] = {};
    volumes[`sharedterm-${sessionId}-home`] = {};
  } else {
    binds.push(`${config.workspacePath}:/workspace:${workspaceMode}`);
  }

  // Only mount git credentials when explicitly allowed by the owner
  if (config.allowGitPush && !config.persistent) {
    binds.push(...getGitBinds());
  }

  return {
    Image: config.image,
    name: `sharedterm-${sessionId}`,
    Tty: true,
    OpenStdin: true,
    Volumes: Object.keys(volumes).length > 0 ? volumes : undefined,
    HostConfig: {
      Binds: config.persistent
        ? [
            `sharedterm-${sessionId}:/workspace:rw`,
            `sharedterm-${sessionId}-home:/home/developer:rw`,
          ]
        : binds,
      Memory: config.memoryLimit,
      MemorySwap: config.memoryLimit, // prevent swap
      PidsLimit: config.pidLimit,
      CpuPeriod: 100000,
      CpuQuota: 50000, // 50% CPU limit
      CapDrop: ['ALL'],
      CapAdd: [] as string[],
      SecurityOpt: ['no-new-privileges:true'],
      NetworkMode: 'sharedterm-isolated',
      ReadonlyRootfs: true,
      Tmpfs: {
        '/tmp': 'rw,noexec,nosuid,size=64m',
        '/run': 'rw,noexec,nosuid,size=16m',
        '/var/tmp': 'rw,noexec,nosuid,size=32m',
        ...(config.persistent ? {} : { '/home/developer': 'rw,nosuid,size=128m' }),
      },
      Ulimits: [
        { Name: 'nofile', Soft: 1024, Hard: 2048 },
        { Name: 'core', Soft: 0, Hard: 0 },
        { Name: 'nproc', Soft: 256, Hard: 256 },
      ],
      Dns: ['8.8.8.8', '8.8.4.4'],
    },
    WorkingDir: '/workspace',
    User: '1000:1000',
    Labels: {
      'sharedterminal.session': sessionId,
      'sharedterminal.managed': 'true',
      'sharedterminal.version': '2.0.0',
      'sharedterminal.created': new Date().toISOString(),
      ...(config.persistent ? { 'sharedterminal.persistent': 'true' } : {}),
    },
  };
}

export function buildExecOptions(cmd: string[], cols: number, rows: number) {
  // Wrap shell command to bootstrap home directory from /etc/skel if needed
  // (tmpfs home is empty on first exec since entrypoint only runs on container start)
  const bootstrapCmd = [
    '/bin/bash', '-c',
    'if [ ! -f "$HOME/.bashrc" ]; then cp -r /etc/skel/. "$HOME/" 2>/dev/null; fi; exec /bin/bash',
  ];
  const finalCmd = cmd.length === 1 && cmd[0] === '/bin/bash' ? bootstrapCmd : cmd;

  return {
    Cmd: finalCmd,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Env: [
      `TERM=xterm-256color`,
      `COLUMNS=${cols}`,
      `LINES=${rows}`,
    ],
  };
}
