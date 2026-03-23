import { Command } from 'commander';
import { loadCliConfig } from '../cli-config';

export const stopCommand = new Command('stop')
  .description('Stop a SharedTerminal session')
  .option('-t, --token <token>', 'Session owner token')
  .option('--server <url>', 'Server URL')
  .action(async (options) => {
    const config = loadCliConfig();
    const serverUrl = options.server || config.serverUrl;
    const token = options.token || config.lastToken;

    if (!token) {
      console.error('No token provided. Use --token or start a session first.');
      process.exit(1);
    }

    try {
      const res = await fetch(`${serverUrl}/api/session/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json() as { error: string };
        console.error(`Error: ${data.error}`);
        process.exit(1);
      }

      console.log('Session stopped successfully.');
    } catch (err) {
      console.error(`Failed to stop session: ${(err as Error).message}`);
      process.exit(1);
    }
  });
