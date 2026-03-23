/**
 * asciicast v2 format types — compatible with asciinema-player.
 * See: https://docs.asciinema.org/manual/asciicast/v2/
 */

export interface AsciicastHeader {
  version: 2;
  width: number;
  height: number;
  timestamp: number;
  title?: string;
  env?: Record<string, string>;
}

/**
 * Event line: [time_offset_seconds, event_type, data]
 * event_type: "o" = output (terminal → user), "i" = input (user → terminal)
 */
export type AsciicastEvent = [number, 'o' | 'i', string];
