import { Command } from 'commander';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig } from '../../server/config';
import { LicenseValidator, TIER_LABELS } from '../../server/license';

const ACCENT = '\x1b[38;2;218;119;86m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const CURRENT_VERSION = '2.0.0';

function fetchLatestVersion(registryUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const url = new URL(registryUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const req = client.get(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        headers: { 'User-Agent': 'SharedTerminal/2.0.0' },
        timeout: 10_000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json['dist-tags']?.latest || json.version || null);
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export const adminCommand = new Command('admin')
  .description('Administration commands');

adminCommand
  .command('check-updates')
  .description('Check for available updates')
  .action(async () => {
    console.log('');
    console.log(`  ${ACCENT}${BOLD}SharedTerminal Enterprise${RESET} — Update Check`);
    console.log(`  ${DIM}${'─'.repeat(48)}${RESET}`);
    console.log('');
    console.log(`  ${DIM}Installed:${RESET}  ${BOLD}v${CURRENT_VERSION}${RESET}`);
    console.log(`  ${DIM}Checking...${RESET}`);

    const latest = await fetchLatestVersion(
      'https://registry.npmjs.org/sharedterminal-enterprise'
    );

    // Move cursor up to overwrite "Checking..."
    process.stdout.write('\x1b[1A\x1b[2K');

    if (!latest) {
      console.log(`  ${DIM}Latest:${RESET}     ${YELLOW}Unable to check${RESET} ${DIM}(registry unreachable)${RESET}`);
      console.log('');
      console.log(`  ${DIM}Check manually: https://github.com/saartur/sharedterminal/releases${RESET}`);
    } else if (compareVersions(latest, CURRENT_VERSION) > 0) {
      console.log(`  ${DIM}Latest:${RESET}     ${GREEN}${BOLD}v${latest}${RESET} ${ACCENT}← update available${RESET}`);
      console.log('');
      console.log(`  ${BOLD}To update:${RESET}`);
      console.log(`    npm update -g sharedterminal-enterprise`);
      console.log('');
      console.log(`  ${DIM}Changelog: https://github.com/saartur/sharedterminal/releases/tag/v${latest}${RESET}`);
    } else {
      console.log(`  ${DIM}Latest:${RESET}     ${GREEN}v${latest}${RESET} ${DIM}(up to date)${RESET}`);
    }
    console.log('');
  });

adminCommand
  .command('license')
  .description('Show current license information')
  .action(async () => {
    const config = loadConfig();
    const validator = new LicenseValidator();
    const license = await validator.validate(config.licenseKey, config.licenseServerUrl);

    console.log('');
    console.log(`  ${ACCENT}${BOLD}SharedTerminal Enterprise${RESET} — License Info`);
    console.log(`  ${DIM}${'─'.repeat(48)}${RESET}`);
    console.log('');

    if (validator.isCommunity()) {
      console.log(`  ${DIM}Tier:${RESET}          ${YELLOW}○${RESET} ${TIER_LABELS.community}`);
      console.log(`  ${DIM}Organization:${RESET}  Open Source`);
      console.log('');
      console.log(`  ${DIM}${'─'.repeat(48)}${RESET}`);
      console.log('');
      console.log(`  ${DIM}Running in free community mode.${RESET}`);
      console.log(`  ${DIM}Enterprise features (SSO, audit logging, DLP,${RESET}`);
      console.log(`  ${DIM}session recording) require a commercial license.${RESET}`);
      console.log('');
      console.log(`  ${ACCENT}Upgrade:${RESET} ${BOLD}https://sharedterminal.com/pricing${RESET}`);
      console.log('');
      console.log(`  ${DIM}Set your key:${RESET} LICENSE_KEY=<key> sharedterminal --path ./project`);
    } else {
      const tierLabel = TIER_LABELS[license.tier];
      console.log(`  ${DIM}Tier:${RESET}          ${GREEN}●${RESET} ${BOLD}${tierLabel}${RESET}`);
      console.log(`  ${DIM}Organization:${RESET}  ${license.organization}`);
      console.log(`  ${DIM}Seats:${RESET}         ${license.seats === Infinity ? 'Unlimited' : license.seats}`);
      console.log(`  ${DIM}Valid Until:${RESET}   ${license.validUntil}`);
      console.log('');
      console.log(`  ${DIM}Features:${RESET}`);
      for (const feature of license.features) {
        console.log(`    ${GREEN}✓${RESET} ${feature}`);
      }
    }
    console.log('');
  });

adminCommand
  .command('cache-clear')
  .description('Clear cached license and update data')
  .action(() => {
    const cacheFile = path.join(os.homedir(), '.sharedterminal', 'data', 'license-cache.json');
    try {
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
        console.log(`  ${GREEN}✓${RESET} License cache cleared`);
      } else {
        console.log(`  ${DIM}No cache to clear${RESET}`);
      }
    } catch (err) {
      console.error(`  ${RED}✗${RESET} Failed to clear cache: ${(err as Error).message}`);
    }
    console.log('');
  });
