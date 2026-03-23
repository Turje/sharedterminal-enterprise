import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.sharedterminal');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface CliConfig {
  serverUrl: string;
  lastToken?: string;
  lastSessionId?: string;
}

function defaultConfig(): CliConfig {
  return {
    serverUrl: 'http://localhost:3000',
  };
}

export function loadCliConfig(): CliConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {
    // Fall through to default
  }
  return defaultConfig();
}

export function saveCliConfig(config: CliConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
