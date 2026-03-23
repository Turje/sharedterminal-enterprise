#!/usr/bin/env node

import { Command } from 'commander';
import { startCommand } from './commands/start';
import { joinCommand } from './commands/join';
import { stopCommand } from './commands/stop';
import { statusCommand } from './commands/status';
import { chatCommand } from './commands/chat';
import { runSharedfolder } from './commands/sharedfolder';

const program = new Command();

program
  .name('sharedfolder')
  .description('SharedTerminal Enterprise — share any folder as a collaborative terminal')
  .version('2.0.0')
  .option('-p, --path <path>', 'Project path to share', process.cwd())
  .option('--password <password>', 'Session password (auto-generated if omitted)')
  .option('-n, --name <name>', 'Session name')
  .option('--git', 'Allow git push (mounts SSH keys and gitconfig)')
  .option('--read-only', 'Share folder as read-only')
  .option('--persistent', 'Enable persistent sessions (state survives disconnects)')
  .option('--server-url <url>', 'Self-hosted server URL (disables tunnel)')
  .action(async (options) => {
    await runSharedfolder(options);
  });

program.addCommand(startCommand);
program.addCommand(joinCommand);
program.addCommand(stopCommand);
program.addCommand(statusCommand);
program.addCommand(chatCommand);

program.parse();
