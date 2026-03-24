# Incident Sandbox

A buggy microservice for collaborative debugging practice.

## Quick Start

```bash
npm start          # Start the server (watch for redacted secrets in logs)
cat .env           # Test DLP — secrets are automatically masked
curl :3001/health  # Health check
curl :3001/crash   # Hit this 5 times to trigger the bug
```

## The Bug

The `/crash` endpoint has a counter that throws an unhandled exception after
5 requests. Your mission: find the root cause and fix it before the service
goes down in production.

## What to Notice

- **DLP in action**: When the server starts, it logs a Stripe key — watch it
  get redacted in real-time by SharedTerminal's secret scanner.
- **`.env` file**: Contains fake AWS keys, database URLs, and API secrets.
  Run `cat .env` to see them all get masked.
- **Collaboration**: Share the session URL with a teammate to debug together.
