import { EventEmitter } from 'events';
import { TerminalSize } from '../../shared/types';
import { DockerManager } from '../docker/docker-manager';
import { ScrollbackBuffer } from './scrollback-buffer';

export interface TerminalEvents {
  data: (data: string) => void;
  exit: (code: number) => void;
  error: (err: Error) => void;
}

export class Terminal extends EventEmitter {
  public readonly id: string;
  public readonly scrollback: ScrollbackBuffer;
  private stream: NodeJS.ReadWriteStream | null = null;
  private execId: string | null = null;
  private closed = false;

  constructor(
    id: string,
    private dockerManager: DockerManager,
    private containerId: string,
    private cols: number,
    private rows: number
  ) {
    super();
    this.id = id;
    this.scrollback = new ScrollbackBuffer();
  }

  async start(): Promise<void> {
    const { stream, execId } = await this.dockerManager.exec(
      this.containerId,
      this.cols,
      this.rows
    );
    this.stream = stream;
    this.execId = execId;

    stream.on('data', (data: Buffer) => {
      if (!this.closed) {
        const text = data.toString('utf-8');
        this.scrollback.append(text);
        this.emit('data', text);
      }
    });

    stream.on('end', () => {
      if (!this.closed) {
        this.closed = true;
        this.emit('exit', 0);
      }
    });

    stream.on('error', (err: Error) => {
      if (!this.closed) {
        this.emit('error', err);
      }
    });
  }

  write(data: string): void {
    if (this.stream && !this.closed) {
      this.stream.write(data);
    }
  }

  async resize(size: TerminalSize): Promise<void> {
    if (this.execId) {
      this.cols = size.cols;
      this.rows = size.rows;
      await this.dockerManager.resizeExec(this.execId, size);
    }
  }

  destroy(): void {
    this.closed = true;
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
    this.removeAllListeners();
  }
}
