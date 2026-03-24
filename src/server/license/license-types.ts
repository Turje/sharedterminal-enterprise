export type LicenseTier = 'community' | 'professional' | 'enterprise';

export interface LicenseInfo {
  valid: boolean;
  key: string;
  tier: LicenseTier;
  organization: string;
  seats: number;
  validUntil: string;
  features: string[];
}

export interface LicenseValidationResponse {
  valid: boolean;
  tier?: LicenseTier;
  organization?: string;
  seats?: number;
  validUntil?: string;
  features?: string[];
  error?: string;
}

export const TIER_FEATURES: Record<LicenseTier, string[]> = {
  community: [
    'terminal-sharing',
    'chat',
    'follow-mode',
    'ai-assistant',
    'dlp',
  ],
  professional: [
    'terminal-sharing',
    'chat',
    'follow-mode',
    'ai-assistant',
    'persistent-sessions',
    'custom-branding',
  ],
  enterprise: [
    'terminal-sharing',
    'chat',
    'follow-mode',
    'ai-assistant',
    'persistent-sessions',
    'custom-branding',
    'sso',
    'audit-logging',
    'dlp',
    'session-recording',
    'admin-panel',
  ],
};

export const COMMUNITY_LICENSE: LicenseInfo = {
  valid: true,
  key: '',
  tier: 'community',
  organization: 'Open Source',
  seats: Infinity,
  validUntil: 'unlimited',
  features: TIER_FEATURES.community,
};

export const TIER_LABELS: Record<LicenseTier, string> = {
  community: 'Community (AGPL-3.0)',
  professional: 'Professional',
  enterprise: 'Enterprise',
};
