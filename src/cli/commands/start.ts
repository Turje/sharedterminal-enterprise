import { Command } from 'commander';
import path from 'path';
import os from 'os';
import { loadCliConfig, saveCliConfig } from '../cli-config';
import { generatePassword } from '../../shared/utils';

export const startCommand = new Command('start')
  .description('Start a new SharedTerminal session')
  .option('-p, --path <path>', 'Project path to share', process.cwd())
  .option('-n, --name <name>', 'Session name')
  .option('--server <url>', 'Server URL')
  .option('--owner-name <name>', 'Your display name', os.userInfo().username)
  .option('--password <password>', 'Session password (auto-generated if omitted)')
  .action(async (options) => {
    const config = loadCliConfig();
    const serverUrl = options.server || config.serverUrl;

    const projectPath = path.resolve(options.path);
    const password = options.password || generatePassword();

    console.log(`Starting SharedTerminal session for: ${projectPath}`);

    try {
      const res = await fetch(`${serverUrl}/api/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath,
          name: options.name || path.basename(projectPath),
          ownerName: options.ownerName,
          password,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error: string };
        console.error(`Error: ${data.error}`);
        process.exit(1);
      }

      const { token, url } = await res.json() as { sessionId: string; token: string; url: string };

      // Save for later
      saveCliConfig({ ...config, lastToken: token });

      console.log('\n  Share this with your teammate:\n');
      console.log(`  URL:      ${url}`);
      console.log(`  Password: ${password}`);
      console.log(`\n  To stop:  sharedterm stop`);
    } catch (err) {
      console.error(`Failed to connect to server at ${serverUrl}`);
      console.error('Make sure the server is running: npm run dev');
      process.exit(1);
    }
  });
