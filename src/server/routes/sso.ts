import { Router, Request, Response } from 'express';
import { SessionManager } from '../session/session-manager';
import { TokenStore } from '../auth/token';
import { ServerConfig } from '../config';
import {
  OidcConfig,
  generateOidcState,
  getAuthorizationUrl,
  exchangeCode,
  validateIdToken,
  isEmailDomainAllowed,
  getLogoutUrl,
} from '../auth/oidc';
import { formatSessionUrlFromBase } from '../../shared/utils';

// In-memory store for pending SSO flows (state → { nonce, sessionId, returnUrl })
interface PendingSsoFlow {
  nonce: string;
  sessionId: string;
  returnUrl: string;
  createdAt: number;
}

export function createSsoRouter(
  sessionManager: SessionManager,
  tokenStore: TokenStore,
  config: ServerConfig
): Router {
  const router = Router();
  const pendingFlows = new Map<string, PendingSsoFlow>();

  // Clean up expired pending flows every 5 minutes
  setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000; // 10 min expiry
    for (const [state, flow] of pendingFlows) {
      if (flow.createdAt < cutoff) {
        pendingFlows.delete(state);
      }
    }
  }, 5 * 60_000);

  function getOidcConfig(): OidcConfig | null {
    if (!config.ssoEnabled || !config.ssoIssuerUrl || !config.ssoClientId || !config.ssoClientSecret) {
      return null;
    }
    return {
      issuerUrl: config.ssoIssuerUrl,
      clientId: config.ssoClientId,
      clientSecret: config.ssoClientSecret,
      callbackUrl: config.ssoCallbackUrl || `${config.serverUrl}/api/auth/sso/callback`,
      allowedDomains: config.ssoAllowedDomains,
      scopes: ['openid', 'profile', 'email'],
    };
  }

  // GET /api/auth/sso/config — client checks if SSO is enabled
  router.get('/api/auth/sso/config', (_req: Request, res: Response) => {
    res.json({
      enabled: config.ssoEnabled,
      // Don't expose secrets, just the info the client needs
      issuerUrl: config.ssoEnabled ? config.ssoIssuerUrl : undefined,
      passwordFallback: config.ssoPasswordFallback,
    });
  });

  // GET /api/auth/sso/login?session=<sessionId> — redirect to IdP
  router.get('/api/auth/sso/login', async (req: Request, res: Response) => {
    try {
      const oidcConfig = getOidcConfig();
      if (!oidcConfig) {
        res.status(400).json({ error: 'SSO is not configured' });
        return;
      }

      const sessionId = req.query.session as string;
      if (!sessionId) {
        res.status(400).json({ error: 'session parameter required' });
        return;
      }

      // Verify the session exists
      try {
        sessionManager.getSession(sessionId);
      } catch {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const state = generateOidcState();
      const nonce = generateOidcState();

      // Build return URL
      const returnUrl = formatSessionUrlFromBase(sessionManager.getBaseUrl(), sessionId);

      pendingFlows.set(state, {
        nonce,
        sessionId,
        returnUrl,
        createdAt: Date.now(),
      });

      const authUrl = await getAuthorizationUrl(oidcConfig, state, nonce);
      res.redirect(authUrl);
    } catch (err) {
      console.error('[sso] Login redirect error:', (err as Error).message);
      res.status(500).json({ error: 'SSO login failed' });
    }
  });

  // GET /api/auth/sso/callback — IdP redirects here after authentication
  router.get('/api/auth/sso/callback', async (req: Request, res: Response) => {
    try {
      const oidcConfig = getOidcConfig();
      if (!oidcConfig) {
        res.status(400).json({ error: 'SSO is not configured' });
        return;
      }

      const code = req.query.code as string;
      const state = req.query.state as string;
      const error = req.query.error as string;

      if (error) {
        const errorDesc = req.query.error_description as string || error;
        res.status(401).send(`<html><body><h2>SSO Login Failed</h2><p>${errorDesc}</p><p><a href="javascript:history.back()">Go back</a></p></body></html>`);
        return;
      }

      if (!code || !state) {
        res.status(400).json({ error: 'Missing code or state parameter' });
        return;
      }

      // Validate state
      const flow = pendingFlows.get(state);
      if (!flow) {
        res.status(400).send('<html><body><h2>Invalid or expired SSO state</h2><p>Please try logging in again.</p></body></html>');
        return;
      }
      pendingFlows.delete(state);

      // Check expiry (10 min)
      if (Date.now() - flow.createdAt > 10 * 60 * 1000) {
        res.status(400).send('<html><body><h2>SSO session expired</h2><p>Please try logging in again.</p></body></html>');
        return;
      }

      // Exchange code for tokens
      const { idToken } = await exchangeCode(oidcConfig, code);

      // Validate ID token
      const userInfo = await validateIdToken(oidcConfig, idToken, flow.nonce);

      // Check email domain allowlist
      if (!isEmailDomainAllowed(userInfo.email, oidcConfig.allowedDomains)) {
        // Audit: SSO domain rejection
        try {
          const session = sessionManager.getSession(flow.sessionId);
          session.auditLogger?.log('auth.failure', {
            userName: userInfo.email,
            ip: req.ip,
            data: { reason: 'domain_not_allowed', email: userInfo.email },
          });
        } catch {}

        res.status(403).send(`<html><body><h2>Access Denied</h2><p>Your email domain is not authorized for this session.</p></body></html>`);
        return;
      }

      // Generate SharedTerminal token and join session
      const { token, userId } = sessionManager.generateJoinToken(
        flow.sessionId,
        userInfo.name || userInfo.email,
        'editor'
      );

      // Audit: SSO auth success
      try {
        const session = sessionManager.getSession(flow.sessionId);
        session.auditLogger?.log('auth.success', {
          userId,
          userName: userInfo.name,
          ip: req.ip,
          data: {
            method: 'sso',
            email: userInfo.email,
            idpSubject: userInfo.sub,
          },
        });
      } catch {}

      // Redirect to session with token
      const returnUrl = new URL(flow.returnUrl);
      returnUrl.searchParams.set('token', token);
      returnUrl.searchParams.set('sso', '1');
      res.redirect(returnUrl.toString());
    } catch (err) {
      console.error('[sso] Callback error:', (err as Error).message);
      res.status(500).send(`<html><body><h2>SSO Error</h2><p>${(err as Error).message}</p><p><a href="javascript:history.back()">Go back</a></p></body></html>`);
    }
  });

  // GET /api/auth/sso/logout — redirect to IdP logout (optional)
  router.get('/api/auth/sso/logout', async (_req: Request, res: Response) => {
    try {
      const oidcConfig = getOidcConfig();
      if (!oidcConfig) {
        res.status(400).json({ error: 'SSO is not configured' });
        return;
      }

      const logoutUrl = await getLogoutUrl(oidcConfig);
      if (logoutUrl) {
        res.redirect(logoutUrl);
      } else {
        res.json({ message: 'Logged out (IdP does not support session logout)' });
      }
    } catch (err) {
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  return router;
}
