import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { SESSION_FILE_NAME, SessionFileData } from './sharedfolder';

// ANSI color codes
const ACCENT = '\x1b[38;2;218;119;86m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function findSessionFile(startDir: string): SessionFileData | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const filePath = path.join(dir, SESSION_FILE_NAME);
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export const chatCommand = new Command('chat')
  .description('Chat with teammates in the running SharedTerminal session')
  .argument('[message]', 'Send a single message (omit for interactive mode)')
  .action(async (message?: string) => {
    const sessionData = findSessionFile(process.cwd());
    if (!sessionData) {
      console.error(`\n  ${ACCENT}No running SharedTerminal session found.${RESET}`);
      console.error(`  ${DIM}Run "sharedterminal sharedfolder" first.${RESET}\n`);
      process.exit(1);
    }

    const { port, sessionId, ownerName } = sessionData;
    const baseUrl = `http://127.0.0.1:${port}`;

    // Single message mode
    if (message) {
      try {
        const res = await fetch(`${baseUrl}/api/host/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, sessionId }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error: string };
          console.error(`  Error: ${data.error}`);
          process.exit(1);
        }
        console.log(`  ${DIM}[sent]${RESET} ${message}`);
      } catch {
        console.error(`  ${ACCENT}Cannot connect to SharedTerminal server on port ${port}.${RESET}`);
        process.exit(1);
      }
      return;
    }

    // Interactive mode
    console.log('');
    console.log(`  ${ACCENT}SharedTerminal Chat${RESET} ${DIM}— connected as ${BOLD}${ownerName}${RESET}`);
    console.log(`  ${DIM}Type a message and press Enter. Ctrl+C to exit.${RESET}`);
    console.log('');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `  ${ACCENT}>${RESET} `,
    });

    // Poll for incoming messages
    let polling = true;
    async function pollMessages() {
      while (polling) {
        try {
          const res = await fetch(`${baseUrl}/api/host/messages?sessionId=${sessionId}`);
          if (res.ok) {
            const data = (await res.json()) as { messages: Array<{ userName: string; message: string; timestamp: string }> };
            for (const msg of data.messages) {
              readline.clearLine(process.stdout, 0);
              readline.cursorTo(process.stdout, 0);
              console.log(`  ${DIM}[chat]${RESET} ${ACCENT}${msg.userName}${RESET}: ${msg.message}`);
              rl.prompt(true);
            }
          }
        } catch {
          // Server might be down
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    pollMessages();

    rl.prompt();

    rl.on('line', async (line) => {
      const text = line.trim();
      if (text) {
        try {
          await fetch(`${baseUrl}/api/host/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, sessionId }),
          });
        } catch {
          console.log(`  ${DIM}[error] Failed to send message${RESET}`);
        }
      }
      rl.prompt();
    });

    rl.on('close', () => {
      polling = false;
      process.exit(0);
    });

    process.on('SIGINT', () => {
      polling = false;
      rl.close();
    });
  });
