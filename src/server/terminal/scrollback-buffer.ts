import { DEFAULTS } from '../../shared/constants';

/**
 * Ring buffer that stores the last N lines of terminal output.
 * Used for reconnection sync and follow mode history.
 */
export class ScrollbackBuffer {
  private lines: string[] = [];
  private maxLines: number;
  private partialLine = '';

  constructor(maxLines: number = DEFAULTS.SCROLLBACK_MAX_LINES) {
    this.maxLines = maxLines;
  }

  append(data: string): void {
    const text = this.partialLine + data;
    const parts = text.split('\n');

    // Last element is the incomplete line (may be empty string if data ends with \n)
    this.partialLine = parts.pop() || '';

    // All other parts are complete lines
    for (const line of parts) {
      this.lines.push(line);
    }

    // Trim to max lines
    if (this.lines.length > this.maxLines) {
      this.lines = this.lines.slice(this.lines.length - this.maxLines);
    }
  }

  getScrollback(): string {
    const result = this.lines.join('\n');
    if (this.partialLine) {
      return result + '\n' + this.partialLine;
    }
    return result;
  }

  getLineCount(): number {
    return this.lines.length + (this.partialLine ? 1 : 0);
  }

  clear(): void {
    this.lines = [];
    this.partialLine = '';
  }
}
