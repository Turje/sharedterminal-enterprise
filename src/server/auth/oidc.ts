import crypto from 'crypto';
import https from 'https';
import http from 'http';

/**
 * Lightweight OIDC client — zero external dependencies.
 * Supports Okta, Microsoft Entra ID, Google Workspace, Auth0, Keycloak,
 * and any OIDC-compliant identity provider.
 */

export interface OidcConfig {
  issuerUrl: string;       // e.g., https://company.okta.com
  clientId: string;
  clientSecret: string;
  callbackUrl: string;     // e.g., https://terminal.company.com/api/auth/sso/callback
  allowedDomains: string[]; // e.g., ["company.com"] — restrict by email domain
  scopes: string[];         // e.g., ["openid", "profile", "email"]
}

interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

interface JwkKey {
  kty: string;
  kid: string;
  use?: string;
  n?: string;
  e?: string;
  alg?: string;
}

export interface OidcUserInfo {
  sub: string;          // unique user ID from IdP
  email: string;
  name: string;
  email_verified?: boolean;
}

// Cache discovery and JWKS
let discoveryCache: OidcDiscovery | null = null;
let discoveryIssuer: string | null = null;
let jwksCache: JwkKey[] | null = null;
let jwksCachedAt = 0;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch JSON from a URL using built-in http/https modules.
 */
function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON from ${url}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

/**
 * POST form data and get JSON response.
 */
function postForm(url: string, params: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;

    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON from ${url}: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(body);
    req.end();
  });
}

/**
 * Fetch OIDC discovery document from well-known endpoint.
 */
export async function discover(issuerUrl: string): Promise<OidcDiscovery> {
  if (discoveryCache && discoveryIssuer === issuerUrl) {
    return discoveryCache;
  }

  const url = issuerUrl.replace(/\/$/, '') + '/.well-known/openid-configuration';
  const doc = await fetchJson(url) as OidcDiscovery;

  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw new Error('Invalid OIDC discovery document');
  }

  discoveryCache = doc;
  discoveryIssuer = issuerUrl;
  return doc;
}

/**
 * Fetch JWKS (JSON Web Key Set) for token signature verification.
 */
async function getJwks(jwksUri: string): Promise<JwkKey[]> {
  if (jwksCache && Date.now() - jwksCachedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache;
  }

  const data = await fetchJson(jwksUri) as { keys: JwkKey[] };
  jwksCache = data.keys;
  jwksCachedAt = Date.now();
  return data.keys;
}

/**
 * Decode a JWT without verification (to read header/claims).
 */
function decodeJwt(token: string): { header: Record<string, string>; payload: Record<string, unknown> } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  return { header, payload };
}

/**
 * Verify a JWT signature using RS256 and a JWK public key.
 */
function verifyJwtSignature(token: string, key: JwkKey): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const signedData = `${parts[0]}.${parts[1]}`;
  const signature = Buffer.from(parts[2], 'base64url');

  // Convert JWK to Node crypto key object
  const publicKey = crypto.createPublicKey({
    key: {
      kty: key.kty,
      n: key.n,
      e: key.e,
    },
    format: 'jwk',
  });

  return crypto.verify('RSA-SHA256', Buffer.from(signedData), publicKey, signature);
}

/**
 * Generate a cryptographically random state or nonce value.
 */
export function generateOidcState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Build the authorization URL to redirect the user to the IdP.
 */
export async function getAuthorizationUrl(
  oidcConfig: OidcConfig,
  state: string,
  nonce: string
): Promise<string> {
  const discovery = await discover(oidcConfig.issuerUrl);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: oidcConfig.clientId,
    redirect_uri: oidcConfig.callbackUrl,
    scope: oidcConfig.scopes.join(' '),
    state,
    nonce,
  });

  return `${discovery.authorization_endpoint}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCode(
  oidcConfig: OidcConfig,
  code: string
): Promise<{ idToken: string; accessToken: string }> {
  const discovery = await discover(oidcConfig.issuerUrl);

  const response = await postForm(discovery.token_endpoint, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: oidcConfig.callbackUrl,
    client_id: oidcConfig.clientId,
    client_secret: oidcConfig.clientSecret,
  }) as { id_token?: string; access_token?: string; error?: string; error_description?: string };

  if (response.error) {
    throw new Error(`Token exchange failed: ${response.error_description || response.error}`);
  }

  if (!response.id_token || !response.access_token) {
    throw new Error('Missing id_token or access_token in response');
  }

  return { idToken: response.id_token, accessToken: response.access_token };
}

/**
 * Validate an ID token: verify signature, check claims (iss, aud, exp, nonce).
 */
export async function validateIdToken(
  oidcConfig: OidcConfig,
  idToken: string,
  expectedNonce: string
): Promise<OidcUserInfo> {
  const discovery = await discover(oidcConfig.issuerUrl);
  const { header, payload } = decodeJwt(idToken);

  // 1. Verify signature
  const keys = await getJwks(discovery.jwks_uri);
  const kid = header.kid;
  const signingKey = keys.find((k) => k.kid === kid && (k.use === 'sig' || !k.use));

  if (!signingKey) {
    throw new Error(`No matching JWK found for kid: ${kid}`);
  }

  if (!verifyJwtSignature(idToken, signingKey)) {
    throw new Error('ID token signature verification failed');
  }

  // 2. Validate issuer
  const expectedIssuer = discovery.issuer;
  if (payload.iss !== expectedIssuer) {
    throw new Error(`Invalid issuer: expected ${expectedIssuer}, got ${payload.iss}`);
  }

  // 3. Validate audience
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(oidcConfig.clientId)) {
    throw new Error(`Invalid audience: ${payload.aud}`);
  }

  // 4. Validate expiration
  const exp = payload.exp as number;
  if (!exp || Date.now() / 1000 > exp + 300) { // 5 min clock skew tolerance
    throw new Error('ID token has expired');
  }

  // 5. Validate nonce (prevents replay attacks)
  if (payload.nonce !== expectedNonce) {
    throw new Error('Invalid nonce — possible replay attack');
  }

  // 6. Extract user info
  const email = payload.email as string;
  const name = (payload.name as string) || (payload.preferred_username as string) || email;
  const sub = payload.sub as string;

  if (!email) {
    throw new Error('ID token missing email claim — ensure "email" scope is requested');
  }

  return { sub, email, name, email_verified: payload.email_verified as boolean | undefined };
}

/**
 * Check if a user's email domain is in the allowed list.
 */
export function isEmailDomainAllowed(email: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true; // no restriction
  const domain = email.split('@')[1]?.toLowerCase();
  return allowedDomains.some((d) => d.toLowerCase() === domain);
}

/**
 * Build the logout URL (if the IdP supports it).
 */
export async function getLogoutUrl(oidcConfig: OidcConfig, idToken?: string): Promise<string | null> {
  try {
    const discovery = await discover(oidcConfig.issuerUrl);
    if (!discovery.end_session_endpoint) return null;

    const params = new URLSearchParams({
      client_id: oidcConfig.clientId,
    });

    if (idToken) {
      params.set('id_token_hint', idToken);
    }

    return `${discovery.end_session_endpoint}?${params.toString()}`;
  } catch {
    return null;
  }
}

/**
 * Clear cached discovery and JWKS (for testing or key rotation).
 */
export function clearOidcCache(): void {
  discoveryCache = null;
  discoveryIssuer = null;
  jwksCache = null;
  jwksCachedAt = 0;
}
