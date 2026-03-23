type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  ts: string;
  level: LogLevel;
  component: string;
  msg: string;
  [key: string]: unknown;
}

const isProduction = process.env.NODE_ENV === 'production';

function formatLog(entry: LogEntry): string {
  if (isProduction) {
    return JSON.stringify(entry);
  }
  // Dev mode: human-readable with component prefix
  const extras = Object.keys(entry)
    .filter((k) => !['ts', 'level', 'component', 'msg'].includes(k))
    .map((k) => `${k}=${JSON.stringify(entry[k])}`)
    .join(' ');
  return `[${entry.component}] ${entry.msg}${extras ? ' ' + extras : ''}`;
}

export function createLogger(component: string) {
  function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      component,
      msg,
      ...data,
    };
    const line = formatLog(entry);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  return {
    info: (msg: string, data?: Record<string, unknown>) => log('info', msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => log('warn', msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log('error', msg, data),
    debug: (msg: string, data?: Record<string, unknown>) => {
      if (!isProduction) log('debug', msg, data);
    },
  };
}
