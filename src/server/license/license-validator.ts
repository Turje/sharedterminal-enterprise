import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import http from 'http';
import {
  LicenseInfo,
  LicenseValidationResponse,
  TIER_FEATURES,
  COMMUNITY_LICENSE,
} from './license-types';
import { createLogger } from '../logger';

const log = createLogger('license');

const CACHE_DIR = path.join(os.homedir(), '.sharedterminal', 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'license-cache.json');
const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days offline grace

interface CachedLicense {
  license: LicenseInfo;
  cachedAt: number;
}

export class LicenseValidator {
  private license: LicenseInfo = { ...COMMUNITY_LICENSE };

  /**
   * Validate a license key against the remote server.
   * Falls back to cached result if server is unreachable.
   * Returns community license if no key is provided.
   */
  async validate(key: string, serverUrl: string): Promise<LicenseInfo> {
    if (!key) {
      this.license = { ...COMMUNITY_LICENSE };
      return this.license;
    }

    try {
      const result = await this.validateRemote(key, serverUrl);
      if (result.valid && result.tier) {
        this.license = {
          valid: true,
          key,
          tier: result.tier,
          organization: result.organization || 'Unknown',
          seats: result.seats || 1,
          validUntil: result.validUntil || 'unknown',
          features: result.features || TIER_FEATURES[result.tier],
        };
        this.cacheResult(this.license);
        return this.license;
      }
      log.warn('License key rejected by server', { error: result.error });
      this.license = { ...COMMUNITY_LICENSE };
      return this.license;
    } catch (err) {
      log.warn('License server unreachable, checking local cache', {
        error: (err as Error).message,
      });
      return this.loadFromCache(key);
    }
  }

  getLicense(): LicenseInfo {
    return this.license;
  }

  hasFeature(feature: string): boolean {
    return this.license.features.includes(feature);
  }

  isEnterprise(): boolean {
    return this.license.tier === 'enterprise';
  }

  isProfessionalOrAbove(): boolean {
    return this.license.tier === 'professional' || this.license.tier === 'enterprise';
  }

  isCommunity(): boolean {
    return this.license.tier === 'community';
  }

  private validateRemote(key: string, serverUrl: string): Promise<LicenseValidationResponse> {
    return new Promise((resolve, reject) => {
      const url = new URL(serverUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;
      const postData = JSON.stringify({ key, product: 'sharedterminal' });

      const req = client.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'User-Agent': 'SharedTerminal/2.0.0',
          },
          timeout: 10_000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error('Invalid response from license server'));
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('License server timeout'));
      });
      req.write(postData);
      req.end();
    });
  }

  private loadFromCache(key: string): LicenseInfo {
    try {
      if (!fs.existsSync(CACHE_FILE)) {
        log.warn('No cached license found, running in community mode');
        this.license = { ...COMMUNITY_LICENSE };
        return this.license;
      }

      const cached: CachedLicense = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));

      if (cached.license.key !== key) {
        log.warn('Cached license key mismatch, running in community mode');
        this.license = { ...COMMUNITY_LICENSE };
        return this.license;
      }

      const ageMs = Date.now() - cached.cachedAt;
      if (ageMs > GRACE_PERIOD_MS) {
        log.warn('Cached license expired (>30 days offline), running in community mode');
        this.license = { ...COMMUNITY_LICENSE };
        return this.license;
      }

      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      log.info('Using cached license (offline mode)', {
        tier: cached.license.tier,
        cacheAge: `${ageDays}d`,
      });
      this.license = cached.license;
      return this.license;
    } catch {
      log.warn('License cache corrupted, running in community mode');
      this.license = { ...COMMUNITY_LICENSE };
      return this.license;
    }
  }

  private cacheResult(license: LicenseInfo): void {
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      const cached: CachedLicense = { license, cachedAt: Date.now() };
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cached, null, 2));
    } catch {
      // Non-fatal — caching failure shouldn't block startup
    }
  }
}
