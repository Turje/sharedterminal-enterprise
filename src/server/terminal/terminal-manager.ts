import { Terminal } from './terminal';
import { DockerManager } from '../docker/docker-manager';
import { TerminalSize } from '../../shared/types';
import { TerminalError } from '../../shared/errors';
import { DEFAULTS } from '../../shared/constants';
import { generateId } from '../../shared/utils';

export class TerminalManager {
  private terminals = new Map<string, Terminal>();

  constructor(
    private dockerManager: DockerManager,
    private containerId: string
  ) {}

  async createTerminal(
    userId: string,
    size?: TerminalSize
  ): Promise<Terminal> {
    const id = generateId();
    const cols = size?.cols || DEFAULTS.TERMINAL_COLS;
    const rows = size?.rows || DEFAULTS.TERMINAL_ROWS;

    const terminal = new Terminal(id, this.dockerManager, this.containerId, cols, rows);
    await terminal.start();

    terminal.on('exit', () => {
      this.terminals.delete(id);
    });

    this.terminals.set(id, terminal);
    return terminal;
  }

  getTerminal(id: string): Terminal | undefined {
    return this.terminals.get(id);
  }

  removeTerminal(id: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.destroy();
      this.terminals.delete(id);
    }
  }

  destroyAll(): void {
    for (const terminal of this.terminals.values()) {
      terminal.destroy();
    }
    this.terminals.clear();
  }

  get count(): number {
    return this.terminals.size;
  }
}
