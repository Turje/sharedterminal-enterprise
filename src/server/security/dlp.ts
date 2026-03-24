const REDACTED = '\x1b[1;31m[REDACTED BY SHAREDTERMINAL DLP]\x1b[0m';

interface SecretPattern {
  name: string;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // AWS keys — match the full KEY=VALUE assignment
  { name: 'AWS Access Key ID', regex: /AWS_ACCESS_KEY_ID\s*=\s*\S+/gi },
  { name: 'AWS Secret Access Key', regex: /AWS_SECRET_ACCESS_KEY\s*=\s*\S+/gi },
  { name: 'AWS Session Token', regex: /AWS_SESSION_TOKEN\s*=\s*\S+/gi },
  // Bare AWS key IDs (AKIA...)
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
  // GitHub tokens
  { name: 'GitHub Token (ghp)', regex: /ghp_[A-Za-z0-9_]{36,}/g },
  { name: 'GitHub Token (gho)', regex: /gho_[A-Za-z0-9_]{36,}/g },
  { name: 'GitHub Token (ghs)', regex: /ghs_[A-Za-z0-9_]{36,}/g },
  { name: 'GitHub Token (github_pat)', regex: /github_pat_[A-Za-z0-9_]{22,}/g },
  // Private keys
  { name: 'Private Key', regex: /-----BEGIN\s+(?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  // Auth tokens
  { name: 'Bearer Token', regex: /[Bb]earer\s+[A-Za-z0-9\-._~+/]+=*/g },
  // Connection strings with embedded credentials (postgresql://, mysql://, mongodb://, redis://, amqp://)
  { name: 'Connection String', regex: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp)s?:\/\/[^\s'"]+/gi },
  // Generic secret env vars — match KEY=VALUE
  { name: 'Generic API Key', regex: /(?:api[_-]?key|api[_-]?secret|apikey)\s*[=:]\s*['"]?[A-Za-z0-9\-._~+/]{16,}['"]?/gi },
  { name: 'Secret Env Var', regex: /(?:PASSWORD|DB_PASS|DB_PASSWORD|MYSQL_PWD|PGPASSWORD|SECRET_KEY|AUTH_TOKEN|PRIVATE_KEY|SECRET|TOKEN|ENCRYPTION_KEY)\s*=\s*\S{4,}/gi },
  // Service tokens
  { name: 'Slack Token', regex: /xox[bporas]-[0-9]+-[A-Za-z0-9-]+/g },
  { name: 'Stripe Key', regex: /sk_(?:live|test)_[A-Za-z0-9]{20,}/g },
];

export interface DlpResult {
  output: string;
  secretsFound: string[];
}

export function scanForSecrets(text: string): DlpResult {
  let output = text;
  const secretsFound: string[] = [];

  for (const pattern of SECRET_PATTERNS) {
    // Reset regex state
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(output)) {
      secretsFound.push(pattern.name);
      pattern.regex.lastIndex = 0;
      output = output.replace(pattern.regex, REDACTED);
    }
  }

  return { output, secretsFound };
}
