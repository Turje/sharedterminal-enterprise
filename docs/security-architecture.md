# SharedTerminal Enterprise — Security Architecture

**Version:** 2.0.0
**Last Updated:** March 2026
**Classification:** Public

---

## Executive Summary

SharedTerminal Enterprise is a self-hosted parallel workspace for development teams. Your team drops into a single project folder inside a secure, sandboxed container — everyone works on the same codebase simultaneously, runs AI coding tools, reviews and ships code together, without compromising your firewall. The host works from their terminal, teammates join via browser or CLI.

All sessions run inside isolated containers on **your** infrastructure. SharedTerminal has **zero access** to your code, credentials, or session data.

This document describes the security architecture, isolation model, and data handling practices for enterprise deployment.

---

## 1. Deployment Model

SharedTerminal is **fully self-hosted**. The software runs on your infrastructure — on-premises servers, private cloud VMs, or air-gapped networks. No data is transmitted to SharedTerminal's servers except for optional license key validation (which can be disabled for air-gapped environments).

| Component | Runs On | Network Access |
|-----------|---------|----------------|
| SharedTerminal Server | Customer infrastructure | Internal network + optional tunnel |
| Session Containers | Customer Docker/Podman host | Isolated bridge network |
| License Validation | api.sharedterminal.com | Outbound HTTPS only (cacheable offline) |

**Air-gapped deployments** are fully supported. License validation results are cached locally for 30 days, and the software degrades gracefully to community mode if the license server is unreachable.

---

## 2. Container Isolation

Every session runs inside a hardened container. SharedTerminal applies defense-in-depth at the container level:

### 2.1 Linux Capabilities

All Linux capabilities are dropped:

```
CapDrop: ['ALL']
CapAdd: []
SecurityOpt: ['no-new-privileges:true']
```

This prevents privilege escalation, raw socket access, and kernel module loading.

### 2.2 Resource Limits

| Resource | Default Limit | Configurable |
|----------|--------------|--------------|
| Memory | 512 MB | `CONTAINER_MEMORY_LIMIT` |
| Memory Swap | Equal to memory (no swap) | — |
| CPU | 50% of one core | — |
| PID count | 256 | `CONTAINER_PID_LIMIT` |
| Open files | 1024 soft / 2048 hard | — |
| Core dumps | Disabled | — |
| Process count | 256 | — |

### 2.3 Filesystem

The container root filesystem is **read-only**. Writable areas are restricted to tmpfs mounts with size limits and security flags:

| Mount | Size | Flags |
|-------|------|-------|
| `/tmp` | 64 MB | `noexec, nosuid` |
| `/run` | 16 MB | `noexec, nosuid` |
| `/var/tmp` | 32 MB | `noexec, nosuid` |
| `/home/developer` | 128 MB | `nosuid` (ephemeral mode) |

The `noexec` flag prevents execution of binaries written to temporary directories, mitigating a common attack vector.

### 2.4 User Namespace

Containers run as a non-root user (`UID 1000:GID 1000`). Combined with `no-new-privileges`, there is no path to root inside the container.

### 2.5 Network Isolation

Containers are attached to an isolated Docker bridge network (`sharedterm-isolated`) with inter-container communication **disabled**:

```
com.docker.network.bridge.enable_icc: false
```

Containers can reach the internet (for package installation and git operations) but cannot communicate with each other. DNS is hardcoded to `8.8.8.8` and `8.8.4.4` to prevent DNS rebinding attacks against internal services.

---

## 3. Authentication & Authorization

### 3.1 Session Access

Sessions are protected by a randomly generated PIN (or user-provided password). Passwords are hashed using bcrypt before storage.

**Brute-force protection:** After 5 failed login attempts from the same IP, the server enforces a 5-minute lockout period.

### 3.2 Token Management

Authentication tokens are:
- Cryptographically random (Node.js `crypto.randomBytes`)
- Stored in-memory only (never written to disk)
- Automatically expired after 24 hours
- Revokable per-session, per-user, or individually

### 3.3 Role-Based Access

| Role | Terminal Access | Chat | Follow | Kick/Ban | AI |
|------|---------------|------|--------|----------|-----|
| Owner | Full | Yes | Yes | Yes | Yes |
| Editor | Full | Yes | Yes | No | Yes |
| Viewer | Read-only | Yes | Yes | No | No |

### 3.4 SSO / OIDC (Enterprise)

Enterprise deployments can configure OpenID Connect for single sign-on. Supported providers include Okta, Azure AD, Google Workspace, and any OIDC-compliant IdP.

Configuration:
- `SSO_ISSUER_URL` — Your IdP's issuer URL
- `SSO_CLIENT_ID` / `SSO_CLIENT_SECRET` — OAuth2 credentials
- `SSO_ALLOWED_DOMAINS` — Restrict access by email domain
- `SSO_PASSWORD_FALLBACK` — Optionally allow password-based join alongside SSO

---

## 4. Data Loss Prevention (Enterprise)

The DLP module scans all terminal output in real time before broadcasting to connected clients. Detected secrets are **redacted** (replaced with `[REDACTED]`) before they reach any user's screen.

### Detected Patterns

- AWS Access Keys (`AKIA...`)
- AWS Secret Keys
- GitHub / GitLab Personal Access Tokens
- Generic API keys and bearer tokens
- Private keys (RSA, EC, PGP)
- Database connection strings
- JWT tokens
- Slack webhooks

### Behavior

1. Terminal output passes through the DLP scanner
2. If a secret pattern matches, the output is redacted
3. The session owner receives a `security:warning` notification
4. The detection event is logged to the audit trail

The DLP scanner operates **inline** — secrets are redacted before they are emitted to any Socket.IO client. The original unredacted output is never transmitted to connected users.

---

## 5. Audit Logging (Enterprise)

Every terminal command, chat message, AI request, session join, kick, and ban is logged per-user to append-only audit files stored in the data directory (`~/.sharedterminal/data/audit/`).

### Logged Events

| Event | Data Captured |
|-------|--------------|
| `session.created` | Session ID, owner, project path |
| `session.joined` | User ID, user name |
| `session.left` | User ID, user name |
| `terminal.created` | User, tab ID |
| `terminal.closed` | User, tab ID |
| `terminal.input` | User, full command text |
| `chat.message` | User, message text |
| `ai.request` | User, prompt text |
| `ai.response` | User, message ID |
| `user.kicked` | Initiator, target user |
| `user.banned` | Initiator, target user |
| `security.dlp_detected` | User, pattern types |

### Tamper-Evident Hash Chain

Every audit entry is linked to its predecessor via SHA-256 hash chaining. Each entry contains:

- `prevHash` — the hash of the previous entry (first entry chains from a known seed)
- `hash` — SHA-256 of `(prevHash + JSON(event))`, forming a cryptographic chain

If any entry is modified, inserted, or deleted after the fact, the chain breaks and verification fails. Admins can verify integrity at any time:

```bash
sharedterminal admin audit-verify
# or verify a specific file:
sharedterminal admin audit-verify ./audit/session-abc123.ndjson
```

Output:

```
  ✓ abc123.ndjson — 847 entries, chain intact
  ✗ def456.ndjson — chain broken at entry 312 of 520
```

### Log Format

Audit logs are stored as newline-delimited JSON (NDJSON). Each entry includes:

```json
{
  "ts": "2026-03-23T14:30:00.000Z",
  "type": "terminal.input",
  "sessionId": "abc123",
  "userId": "user456",
  "userName": "alice",
  "data": { "command": "git push origin main" },
  "prevHash": "a1b2c3...previous hash...",
  "hash": "d4e5f6...sha256 of prevHash + this entry..."
}
```

### Retention & Export

- Maximum file size: 50 MB per session (auto-rotated)
- Rotation: Up to 5 rotated files per session
- Files are stored on the host filesystem, never inside containers
- Format is standard NDJSON — ingestible by Splunk, Elasticsearch, Datadog, or any log aggregator
- Files can be exported directly from the data directory for compliance archival

---

## 6. Session Recording (Enterprise)

Terminal sessions are recorded in **asciicast v2** format, compatible with asciinema players. Recordings capture:

- All terminal output with timestamps
- Terminal dimensions and resize events
- Input events (for audit reconstruction)

Recordings are stored on the host filesystem alongside audit logs. They can be replayed in the built-in web player or any asciicast-compatible tool.

---

## 7. Transport Security

### 7.1 WebSocket-Only

SharedTerminal uses WebSocket transport exclusively (no HTTP long-polling). This reduces attack surface and ensures consistent connection behavior.

```
transports: ['websocket']
maxHttpBufferSize: 1MB
```

### 7.2 TLS

TLS is supported via certificate files. In production deployments, TLS should be terminated either at the SharedTerminal server or at a reverse proxy (nginx, Caddy, cloud load balancer).

### 7.3 DNS Rebinding Protection

The Socket.IO server validates the `Host` header on incoming connections against the configured server URL, logging unexpected origins for monitoring.

---

## 8. Architecture & Trust Boundaries

Each session is a parallel workspace — multiple developers work on the same project folder inside a single isolated container. Each developer gets their own terminal(s), but all terminals share the same filesystem.

The system has three distinct trust boundaries:

```
╔══════════════════════════════════════════════════════════════════╗
║  TRUST BOUNDARY 1: Your Network (firewall / VPC)               ║
║                                                                  ║
║  ┌─────────────┐      ┌──────────────┐                          ║
║  │ Host (CLI)  │      │ Teammate     │                          ║
║  │ Terminal    │      │ Browser/CLI  │                          ║
║  └──────┬──────┘      └──────┬───────┘                          ║
║         │ localhost           │ WSS (TLS)                        ║
║  ╔══════╧════════════════════╧══════════════════════════╗       ║
║  ║  TRUST BOUNDARY 2: SharedTerminal Server Process     ║       ║
║  ║                                                      ║       ║
║  ║  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  ║       ║
║  ║  │ Auth     │  │ DLP      │  │ Audit Logger      │  ║       ║
║  ║  │ (bcrypt, │  │ (inline  │  │ (NDJSON, SHA-256  │  ║       ║
║  ║  │  tokens) │  │  redact) │  │  hash chain)      │  ║       ║
║  ║  └──────────┘  └──────────┘  └───────────────────┘  ║       ║
║  ║                      │                               ║       ║
║  ║              Docker Exec API                         ║       ║
║  ║                      │ (unix socket)                 ║       ║
║  ╚══════════════════════╧═══════════════════════════════╝       ║
║                         │                                        ║
║  ╔══════════════════════╧═══════════════════════════════╗       ║
║  ║  TRUST BOUNDARY 3: Sandboxed Container               ║       ║
║  ║  (per session — isolated from other containers)      ║       ║
║  ║                                                      ║       ║
║  ║  ┌──────────────────────────────────────────────┐    ║       ║
║  ║  │  /workspace (project files)                  │    ║       ║
║  ║  │  /home/developer (ephemeral tmpfs)           │    ║       ║
║  ║  │                                              │    ║       ║
║  ║  │  UID 1000 · no capabilities · read-only root │    ║       ║
║  ║  │  512MB mem · 256 PIDs · no inter-container   │    ║       ║
║  ║  └──────────────────────────────────────────────┘    ║       ║
║  ║          │                                           ║       ║
║  ║  AI tool calls (if Claude Code installed):           ║       ║
║  ║          │ HTTPS ──────────────────────────────────── ╫ ──── ║
║  ╚══════════════════════════════════════════════════════╝       ║
║                                                                  ║
╚════════════════════════════════╦═════════════════════════════════╝
                                 ║ (outbound only)
                                 ▼
                    ┌─────────────────────────┐
                    │  External Services       │
                    │  • api.anthropic.com     │
                    │    (AI tool calls)       │
                    │  • api.sharedterminal.com│
                    │    (license validation)  │
                    │  • github.com, npm, etc. │
                    │    (git push, packages)  │
                    └─────────────────────────┘
```

### Trust Boundary 1 — Your Network

Everything runs inside your firewall. No inbound ports need to be opened unless you choose to expose the server externally. The optional Cloudflare tunnel provides public access without opening ports.

### Trust Boundary 2 — Server Process

The Node.js server handles authentication, DLP scanning, and audit logging. It communicates with containers only via the Docker/Podman unix socket. All terminal output passes through the DLP scanner before reaching any client. Audit logs are written to the host filesystem, never inside containers.

### Trust Boundary 3 — Sandboxed Container

Each session runs in an isolated container with all Linux capabilities dropped. The container has no access to the host filesystem beyond the mounted project directory. If AI tools (like Claude Code) are installed inside the container, they make **outbound HTTPS calls** to external APIs — see section 8.1.

### 8.1 AI Feature — Data Flow & External Calls

SharedTerminal's AI features (`@agent` commands, session summaries) work by running **Claude Code** inside the sandboxed container. This is important for security-conscious teams to understand:

**How it works:**
1. User sends an AI request via the chat panel
2. SharedTerminal server gathers session context (online users, recent commands, chat history, git activity)
3. Server executes `claude -p "<prompt>"` inside the container via Docker exec
4. Claude Code (running inside the container) makes HTTPS calls to `api.anthropic.com`
5. Response streams back through the server to the user

**What leaves your network:**
- The AI prompt (session context + user message) is sent to `api.anthropic.com` over HTTPS
- Claude Code's authentication credentials are stored **inside the container** (not managed by SharedTerminal)
- SharedTerminal itself never stores or transmits API keys

**What stays on your infrastructure:**
- All terminal I/O, chat messages, and file contents
- Audit logs and session recordings
- Authentication tokens and passwords

**To disable AI entirely:** Simply don't install Claude Code in the container image. The AI features gracefully degrade — users see an error message explaining that Claude Code is not available. No external API calls will be made.

**To use AI without external calls:** You can configure Claude Code inside the container to point to a self-hosted LLM endpoint instead of `api.anthropic.com`. SharedTerminal does not control this — it runs whatever `claude` binary is available in the container.

---

## 9. What We Do NOT Have Access To

SharedTerminal is self-hosted software. The vendor (SharedTerminal) has:

- **No access** to your source code or project files
- **No access** to session content, terminal output, or chat messages
- **No access** to authentication tokens or passwords
- **No access** to audit logs or session recordings
- **No access** to your infrastructure or networks

The only outbound communication is optional license key validation, which sends only the license key string and product identifier. This can be disabled entirely for air-gapped deployments.

---

## 10. Compliance Considerations

| Requirement | SharedTerminal Approach |
|-------------|------------------------|
| Data residency | All data stays on your infrastructure |
| Encryption at rest | Defer to host OS / volume encryption |
| Encryption in transit | TLS for all connections |
| Access logging | Comprehensive audit trail |
| Secret detection | Real-time DLP with redaction |
| Least privilege | Containers drop all capabilities, run as non-root |
| Session recording | Full terminal replay for forensic review |
| Credential management | In-memory tokens, bcrypt passwords, auto-expiry |

---

## 11. Incident Response

If a security issue is discovered in SharedTerminal:

1. **Report** — Email security@sharedterminal.com with details
2. **Acknowledgment** — We will respond within 48 hours
3. **Fix** — A patch will be released and documented in the changelog
4. **Disclosure** — After the fix is available, we will publish a security advisory

---

## Contact

- **Security issues:** security@sharedterminal.com
- **General support:** support@sharedterminal.com
- **Documentation:** https://docs.sharedterminal.com
