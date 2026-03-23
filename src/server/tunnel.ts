import { spawn, ChildProcess } from 'child_process';

let tunnelProcess: ChildProcess | null = null;

export async function startTunnel(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;

    try {
      const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      tunnelProcess = proc;

      const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;

      const handleData = (data: Buffer) => {
        const line = data.toString();
        const match = line.match(urlRegex);
        if (match && !resolved) {
          resolved = true;
          resolve(match[0]);
        }
      };

      proc.stdout?.on('data', handleData);
      proc.stderr?.on('data', handleData);

      proc.on('error', (err: NodeJS.ErrnoException) => {
        if (!resolved) {
          resolved = true;
          if (err.code === 'ENOENT') {
            console.warn('[tunnel] cloudflared not found. Install with: brew install cloudflared');
            console.warn('[tunnel] Falling back to localhost URLs.');
          } else {
            console.warn('[tunnel] Failed to start tunnel:', err.message);
          }
          resolve(null);
        }
      });

      proc.on('exit', (code) => {
        if (!resolved) {
          resolved = true;
          console.warn(`[tunnel] cloudflared exited with code ${code}`);
          resolve(null);
        }
        tunnelProcess = null;
      });

      // Timeout after 15s if no URL captured
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('[tunnel] Timed out waiting for tunnel URL.');
          resolve(null);
        }
      }, 15000);
    } catch {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }
  });
}

export function stopTunnel(): void {
  if (tunnelProcess) {
    tunnelProcess.kill('SIGTERM');
    tunnelProcess = null;
    console.log('[tunnel] Tunnel stopped.');
  }
}
