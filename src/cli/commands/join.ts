import { Command } from 'commander';
import os from 'os';
import * as readline from 'readline';
import { loadCliConfig } from '../cli-config';
import { CliTerminal } from '../cli-terminal';

function promptPassword(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve) => {
    rl.question('Session password: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export const joinCommand = new Command('join')
  .description('Join an existing SharedTerminal session')
  .argument('<sessionId>', 'Session ID')
  .option('--name <name>', 'Your display name', os.userInfo().username)
  .option('--password <password>', 'Session password')
  .option('--server <url>', 'Server URL')
  .action(async (sessionId: string, options) => {
    const config = loadCliConfig();
    const serverUrl = options.server || config.serverUrl;
    const name = options.name;
    const password = options.password || await promptPassword();

    if (!password) {
      console.error('Error: A password is required to join a session.');
      process.exit(1);
    }

    console.log('Joining SharedTerminal session...');

    try {
      // Join via REST to get personal token
      const res = await fetch(`${serverUrl}/api/session/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, password, name }),
      });

      if (!res.ok) {
        const data = await res.json() as { error: string };
        console.error(`Error: ${data.error}`);
        process.exit(1);
      }

      const { token: userToken } = await res.json() as { token: string };

      // Connect terminal
      const terminal = new CliTerminal();
      await terminal.connect(serverUrl, userToken, name);
    } catch (err) {
      console.error(`Failed to join session: ${(err as Error).message}`);
      process.exit(1);
    }
  });
