# SharedTerminal Enterprise

Self-hosted collaborative terminal sharing for engineering teams.
Docker-sandboxed. Audit-logged. Session-recorded. SSO-ready.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Node 20+](https://img.shields.io/badge/Node-20%2B-green.svg)
![Docker Required](https://img.shields.io/badge/Docker-Required-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)

---

## Overview

SharedTerminal Enterprise lets engineering teams instantly share a terminal environment for incident response, pair debugging, and collaborative development. Each user gets their own independent shell inside an isolated Docker container with the project mounted as a shared volume. Every keystroke is audit-logged, every session is recorded, and secrets are automatically redacted — all running entirely inside your firewall.

---

## Key Features

### Security

- **Docker Isolation** — Read-only rootfs, dropped capabilities, isolated network, resource limits
- **DLP / Secret Scanning** — Real-time redaction of AWS keys, GitHub tokens, private keys, passwords
- **Audit Logging** — NDJSON format, every command with user attribution, Splunk/Datadog-ready
- **Session Recording** — asciicast v2 format, browser-based playback at `/player`

### Authentication

- **SSO / OIDC** — Okta, Microsoft Entra, Google Workspace, Auth0, Keycloak
- **Domain Restriction** — Lock access to specific email domains
- **Brute-Force Protection** — Rate limiting with automatic lockout

### Operations

- **Self-Hosted** — Deploy with docker-compose inside your VPC
- **Admin Dashboard** — Active sessions, connected users, audit log download at `/admin`
- **Persistent Sessions** — Named Docker volumes survive disconnects
- **Container Cleanup** — Automatic orphan cleanup on ungraceful shutdown

---

## Architecture

```
                         +-------------------------------+
                         |        Express Server         |
                         |                               |
  Host CLI ------------>|   +-- Audit Logger            |
                         |   |   (NDJSON, per-session)   |
                         |   |                           |
  Browser Client ------>|   +-- DLP Scanner             |
                         |   |   (real-time redaction)   |
                         |   |                           |
                         |   +-- Session Recorder        |
                         |   |   (asciicast v2 capture)  |
                         |   |                           |
                         |   +-- SSO / OIDC              |
                         |       (pluggable IdP)         |
                         +----------|--------------------+
                                    |
                                    v
                         +-------------------------------+
                         |     Docker Container          |
                         |         (Sandbox)             |
                         |                               |
                         |   /workspace (shared volume)  |
                         |                               |
                         |   Shell 1  (user A, PTY)      |
                         |   Shell 2  (user B, PTY)      |
                         |   Shell N  (user N, PTY)      |
                         +-------------------------------+
```

All components run inside your network. Zero external dependencies in self-hosted mode.

---

## Quick Start

```bash
# 1. Clone and build
git clone https://github.com/Turje/sharedterminal-enterprise.git
cd sharedterminal-enterprise
npm install && npm run build

# 2. Build the sandbox image
docker build -t sharedterminal:latest docker/

# 3. Start a session
node dist/cli/index.js --path /your/project
```

Open the printed URL in a browser to join. Share the PIN with teammates.

---

## Enterprise Deployment

For production use, deploy with docker-compose:

```bash
cd deploy
cp .env.example .env
# Edit .env with your SERVER_URL, SSO config, etc.
docker-compose up -d
```

See `deploy/.env.example` for the full list of configuration options including
SSO provider setup, resource limits, and feature flags.

---

## CLI Reference

| Flag | Description |
|------|-------------|
| `--path <dir>` | Project directory to share |
| `--password <pin>` | Session PIN (auto-generated if omitted) |
| `--name <name>` | Session name |
| `--git` | Mount SSH keys and gitconfig for git push |
| `--read-only` | Share as read-only |
| `--persistent` | Persist session state across disconnects |
| `--server-url <url>` | Self-hosted mode (disables tunnel) |

---

## Security Model

| Layer | Implementation |
|-------|----------------|
| Container Isolation | Read-only rootfs, all capabilities dropped, no-new-privileges |
| Network | Isolated Docker network, no inter-container communication |
| Resources | Memory limit (512MB), PID limit (256), 50% CPU cap |
| Authentication | Token-based + SSO/OIDC, brute-force protection |
| Secrets | Real-time DLP scanning, automatic redaction |
| Audit | Every action logged in NDJSON, 50MB rotation |
| Recording | Full I/O capture in asciicast v2 |

---

## API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/session/create` | No | Create a new session |
| `POST /api/session/join` | No | Join with PIN |
| `GET /api/session/status` | Token | Session info |
| `POST /api/session/stop` | Owner | Stop session |
| `POST /api/session/kick` | Owner | Kick a user |
| `GET /api/admin/sessions` | Owner | List all sessions |
| `GET /api/admin/audit/:id` | Owner | Download audit log |
| `GET /api/admin/recordings/:id` | Owner | List recordings |
| `GET /admin` | — | Admin dashboard |
| `GET /player` | — | Session recording player |

---

## Configuration

Key environment variables (see `deploy/.env.example` for full reference):

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_URL` | — | Your deployment URL (required for self-hosted) |
| `PORT` | `3000` | Server listen port |
| `DOCKER_IMAGE` | `sharedterminal:latest` | Sandbox container image |
| `DLP_ENABLED` | `true` | Enable real-time secret redaction |
| `RECORDING_ENABLED` | `true` | Enable session recording |
| `SSO_ENABLED` | `false` | Require SSO authentication |
| `SSO_ISSUER_URL` | — | OIDC issuer URL for your IdP |
| `SSO_CLIENT_ID` | — | OAuth2 client ID |

---

## Development

```bash
npm install
npm run build
npm test
```

---

## License

MIT

---

Built for teams that take security seriously.
