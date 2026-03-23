import { io, Socket } from 'socket.io-client';

export class CliTerminal {
  private socket: Socket | null = null;
  private tabId: string = 'cli-default';

  async connect(serverUrl: string, token: string, name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(serverUrl, {
        auth: { token, name },
        transports: ['websocket', 'polling'],
        rejectUnauthorized: false,
      });

      this.socket.on('connect', () => {
        console.log('Connected to SharedTerminal session');
        resolve();
      });

      // Wait for the first terminal:created to know our tabId
      this.socket.on('terminal:created', (data: { tabId: string; index: number }) => {
        this.tabId = data.tabId;
        this.setupTerminal();
      });

      this.socket.on('connect_error', (err) => {
        reject(new Error(`Connection failed: ${err.message}`));
      });

      this.socket.on('session:error', (msg) => {
        console.error(`\nSession error: ${msg}`);
      });

      this.socket.on('session:stopped', () => {
        console.log('\nSession has been stopped by the owner');
        this.cleanup();
        process.exit(0);
      });

      this.socket.on('disconnect', () => {
        console.log('\nDisconnected from server');
        this.cleanup();
        process.exit(0);
      });
    });
  }

  private setupTerminal(): void {
    if (!this.socket) return;

    // Put stdin into raw mode for terminal pass-through
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');

    // Send terminal size
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    this.socket.emit('terminal:resize', { tabId: this.tabId, size: { cols, rows } });

    // Forward stdin to server
    process.stdin.on('data', (data) => {
      this.socket?.emit('terminal:input', { tabId: this.tabId, input: data.toString() });
    });

    // Forward server output to stdout
    this.socket.on('terminal:output', (data: { tabId: string; output: string }) => {
      if (data.tabId === this.tabId) {
        process.stdout.write(data.output);
      }
    });

    // Handle terminal exit
    this.socket.on('terminal:exit', (data: { tabId: string; code: number }) => {
      if (data.tabId === this.tabId) {
        console.log(`\nTerminal exited with code ${data.code}`);
        this.cleanup();
        process.exit(data.code);
      }
    });

    // Handle terminal resize
    process.stdout.on('resize', () => {
      this.socket?.emit('terminal:resize', {
        tabId: this.tabId,
        size: { cols: process.stdout.columns, rows: process.stdout.rows },
      });
    });

    // Presence updates
    this.socket.on('presence:list', (users: Array<{ name: string }>) => {
      process.stdout.write(`\x1b]0;SharedTerminal (${users.length} users)\x07`);
    });
  }

  private cleanup(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    this.socket?.disconnect();
    this.socket = null;
  }
}
