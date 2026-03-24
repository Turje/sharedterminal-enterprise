<h1 align="center">SharedTerminal</h1>

<h3 align="center">Stop screensharing your terminal.<br/>This is multiplayer for the command line.</h3>

<p align="center">
  Jump into one live session, spawn parallel shells, and team up with AI to ship fixes together.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#self-hosting">Self-Hosting</a>
</p>

---

## What is SharedTerminal?

SharedTerminal is an enterprise-grade collaborative terminal environment. Share a secure, sandboxed terminal with your team for live debugging, incident response, and pair programming — all inside isolated Docker containers with real-time audit logging and secret detection.

## Quick Start

```bash
# Install
npm install -g sharedterminal-enterprise

# Share your current directory
sharedterm .

# Your team joins via the URL — no setup required
```

## Features

### Real-Time Collaboration
- **Multi-user terminals** — Everyone types, everyone sees. No screen-sharing lag.
- **Follow mode** — Watch a teammate's terminal in a split pane.
- **Team chat** — Built-in sidebar chat without leaving the terminal.
- **Activity feed** — See who's running what, live.

### Enterprise Security
- **DLP (Data Loss Prevention)** — Secrets are detected and redacted in real-time before they hit any screen. Stripe keys, AWS credentials, database URLs — all auto-masked.
- **Tamper-evident audit log** — Every keystroke, every command, SHA-256 hash-chained. Cryptographically verifiable.
- **Session recording** — Full terminal replay with asciinema-compatible exports.
- **SSO/OIDC** — Integrate with your identity provider.

### Isolated Sandboxes
- **Docker containers** — Each session runs in its own container. No host access.
- **Resource limits** — Memory caps, PID limits, read-only filesystem option.
- **Ephemeral by default** — Containers are destroyed when sessions end. Persistent mode available.

### AI-Assisted Debugging
- **Context-aware AI** — The sidebar AI sees the last 100 lines of your terminal. Ask it about errors, get fixes.
- **Incident post-mortem** — One-click post-mortem report generated from the audit log.
- **Cross-stack analysis** — Works with Node, Python, Go, Rust — whatever's in your container.

### Admin Control Tower
- **Kill switch** — Terminate any session from the admin dashboard.
- **Container resource gauges** — CPU and memory usage per session, live.
- **DLP stats** — See how many secrets have been blocked across all sessions.
- **Audit log search** — Full-text search across session audit logs with hash integrity verification.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Browser (xterm.js + Socket.IO)             │
├─────────────────────────────────────────────┤
│  Express Server                             │
│  ├── Auth (JWT tokens, SSO/OIDC)            │
│  ├── DLP Scanner (real-time redaction)       │
│  ├── Audit Logger (SHA-256 hash chain)       │
│  └── Session Manager                        │
├─────────────────────────────────────────────┤
│  Docker Containers (isolated per session)    │
│  ├── Node.js 20 + Python 3                  │
│  ├── git, vim, nano, tmux, htop             │
│  └── /workspace (your project files)         │
└─────────────────────────────────────────────┘
```

## Self-Hosting

### Docker Compose (Recommended)

```yaml
version: '3.8'
services:
  sharedterminal:
    image: sharedterminal-enterprise
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - ADMIN_TOKEN=your-secret-token
```

```bash
docker compose up -d
```

### From Source

```bash
git clone https://github.com/Turje/sharedterminal-enterprise.git
cd sharedterminal-enterprise
npm install
npm run build
npm start
```

## Demo

The built-in demo includes a cross-stack incident sandbox:
- **Node.js API** — Leaking Stripe keys + crash bug after 5 requests
- **Python ML model** — Sentiment inference that OOMs on batch 3
- **DLP** — `.env` full of fake credentials, all auto-redacted

Run `npm start` and `python3 model.py` in the sandbox, then watch the HUD light up.

## License

AGPL-3.0-or-later
