# Cross-Stack Incident Sandbox

A production stack with two failing services for collaborative debugging.

## Quick Start

```bash
# Node API (leaking secrets + crash bug)
npm start             # Watch for redacted secrets in logs
curl :3001/crash      # Hit 5x to trigger the crash

# Python ML (memory error)
python3 model.py      # Inference crashes on batch 3 (OOM)

# DLP Security
cat .env              # Secrets are auto-masked by DLP
```

## The Bugs

1. **Node API** — The `/crash` endpoint throws after 5 requests. Find and fix the
   counter logic in `server.js`.

2. **ML Inference** — `model.py` crashes with TENSOR_OOM on the 3rd batch. The
   `TENSOR_BUFFER_MULTIPLIER` is set to 512 but should be 64.

## What to Notice

- **DLP**: Stripe keys in server logs get redacted in real-time.
- **`.env`**: Contains fake AWS keys, DB URLs, API secrets — all auto-masked.
- **Multi-role**: Have your SRE fix the API while a DS fixes the model.
- **AI**: Open the sidebar for AI-assisted crash analysis.
