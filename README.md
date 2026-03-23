# SharedTerminal

Share your terminal with teammates in real-time. Each user gets their own shell inside a Docker container with the project mounted as a shared volume — changes sync instantly.

## Features

- **Real-time terminal sharing** — each user gets an independent shell, same project
- **Live chat** — built-in messaging, no Slack/Discord needed
- **Activity feed** — see what commands teammates are running
- **User presence** — see who's online
- **Public access** — auto-tunneled via Cloudflare (no port forwarding)
- **Secure by default** — password-protected, Docker-sandboxed
- **Zero config** — one command to start

## Prerequisites

- **Node.js** >= 18
- **Docker** running locally

## Quick Start

```bash
# 1. Build the Docker image (one-time)
npm run docker:build

# 2. Share your current directory
npx sharedfolder

# 3. Share the URL + password with your teammate
```

## Usage

```bash
# Share current directory
sharedfolder

# Share a specific path
sharedfolder --path /path/to/project

# Set a custom password
sharedfolder --password mysecret

# Name the session
sharedfolder --name "auth-refactor"

# Enable git push from the container
sharedfolder --git

# Read-only mode (viewers can't edit)
sharedfolder --read-only
```

## How It Works

```
                        +-----------------------+
  You (host)            |   Docker Container    |
  +-----------+         |   +---------------+   |
  | Project   |-------->|   | /workspace    |   |
  | Directory | volume  |   | (shared)      |   |
  +-----------+ mount   |   +---------------+   |
                        |   | Shell 1 (you) |   |
  Teammate ----SSH----->|   | Shell 2 (them)|   |
  (via browser)         |   | Shell N (...)  |   |
                        +-----------------------+
                              |
                        Cloudflare Tunnel
                              |
                        Public HTTPS URL
```

1. **`sharedfolder`** spins up a Docker container with your project mounted at `/workspace`
2. A **Cloudflare tunnel** creates a public HTTPS URL
3. Each teammate who joins gets their own **independent shell** inside the same container
4. File changes are **instantly visible** to all users (shared volume)
5. Built-in **chat** and **activity feed** keep everyone coordinated

## Security Model

| Layer | Protection |
|-------|-----------|
| **Password** | Session requires password to join |
| **Docker sandbox** | All code runs in an isolated container — no host access |
| **Volume mount** | Only the specified project directory is mounted |
| **No host shell** | Users never get access to the host machine |
| **Resource limits** | Memory and PID limits prevent abuse |
| **Read-only mode** | Optional flag to prevent file modifications |

## Comparison

| Feature | SharedTerminal | tmate | VS Code Live Share |
|---------|---------------|-------|--------------------|
| Independent shells | Yes | No (shared cursor) | No |
| Browser-based | Yes | No (SSH) | No (VS Code) |
| Docker sandboxed | Yes | No | No |
| Built-in chat | Yes | No | Yes |
| File sync | Instant (volume) | N/A | Manual |
| Zero install for guests | Yes | No | No |
| Public URL | Auto (Cloudflare) | Auto | Manual |

## Development

```bash
# Install dependencies
npm install

# Build Docker image
npm run docker:build

# Build client + server
npm run build

# Run in dev mode
npm run dev

# Run tests
npm test

# Type check
npm run lint
```

## Project Structure

```
src/
  cli/          # CLI entry point (sharedfolder command)
  client/       # Browser UI (xterm.js + Socket.IO)
  server/       # Express + Socket.IO server
    auth/       # Token-based auth
    docker/     # Container management
    session/    # Session lifecycle
    terminal/   # PTY management
    tunnel/     # Cloudflare tunnel
  shared/       # Shared types and utilities
docker/         # Dockerfile for the sandbox container
scripts/        # Build scripts
```

## License

MIT
