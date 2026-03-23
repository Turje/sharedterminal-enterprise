import { Command } from 'commander';
import { loadCliConfig } from '../cli-config';

export const statusCommand = new Command('status')
  .description('Get SharedTerminal session status')
  .option('-t, --token <token>', 'Session token')
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
      const res = await fetch(`${serverUrl}/api/session/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json() as { error: string };
        console.error(`Error: ${data.error}`);
        process.exit(1);
      }

      const { session } = await res.json() as { session: { name: string; status: string; id: string; createdAt: string; userCount: number; users: Array<{ name: string; role: string }> } };

      console.log(`Session: ${session.name}`);
      console.log(`Status:  ${session.status}`);
      console.log(`ID:      ${session.id}`);
      console.log(`Created: ${session.createdAt}`);
      console.log(`Users (${session.userCount}):`);
      for (const user of session.users) {
        console.log(`  - ${user.name} (${user.role})`);
      }
    } catch (err) {
      console.error(`Failed to get status: ${(err as Error).message}`);
      process.exit(1);
    }
  });
