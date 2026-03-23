import { describe, it, expect } from 'vitest';
import { ScrollbackBuffer } from '../../src/server/terminal/scrollback-buffer';

describe('ScrollbackBuffer', () => {
  it('stores complete lines', () => {
    const buf = new ScrollbackBuffer(100);
    buf.append('line 1\nline 2\nline 3\n');
    expect(buf.getLineCount()).toBe(3);
    expect(buf.getScrollback()).toContain('line 1');
    expect(buf.getScrollback()).toContain('line 2');
    expect(buf.getScrollback()).toContain('line 3');
  });

  it('handles partial lines', () => {
    const buf = new ScrollbackBuffer(100);
    buf.append('hello ');
    buf.append('world\n');
    buf.append('partial');
    expect(buf.getScrollback()).toContain('hello world');
    expect(buf.getScrollback()).toContain('partial');
  });

  it('enforces max lines limit', () => {
    const buf = new ScrollbackBuffer(3);
    buf.append('line 1\nline 2\nline 3\nline 4\nline 5\n');
    const scrollback = buf.getScrollback();
    expect(scrollback).not.toContain('line 1');
    expect(scrollback).not.toContain('line 2');
    expect(scrollback).toContain('line 3');
    expect(scrollback).toContain('line 4');
    expect(scrollback).toContain('line 5');
  });

  it('clears buffer', () => {
    const buf = new ScrollbackBuffer(100);
    buf.append('some data\n');
    buf.clear();
    expect(buf.getLineCount()).toBe(0);
    expect(buf.getScrollback()).toBe('');
  });

  it('handles empty input', () => {
    const buf = new ScrollbackBuffer(100);
    buf.append('');
    expect(buf.getLineCount()).toBe(0);
  });

  it('handles data with only newlines', () => {
    const buf = new ScrollbackBuffer(100);
    buf.append('\n\n\n');
    expect(buf.getLineCount()).toBe(3);
  });
});
