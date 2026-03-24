const express = require('express');
const app = express();
const PORT = 3001;

// DANGER: This key is loaded from config — should never appear in logs!
const STRIPE_SECRET_KEY = 'sk_test_DEMO_FAKE_KEY_4242424242424242_not_real';

let crashCounter = 0;

// Request logger with colors
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  const methodColor = method === 'GET' ? '\x1b[32m' : '\x1b[33m';
  console.log(`\x1b[2m${timestamp}\x1b[0m ${methodColor}${method}\x1b[0m ${url}`);
  next();
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Crash endpoint — throws after 5 requests
app.get('/crash', (req, res) => {
  crashCounter++;
  if (crashCounter >= 5) {
    console.log('\x1b[31m[FATAL] Unhandled state overflow — crashCounter exceeded threshold\x1b[0m');
    throw new Error('STATE_OVERFLOW: crashCounter exceeded maximum threshold');
  }
  res.json({
    status: 'degraded',
    crashCounter,
    remaining: 5 - crashCounter,
    warning: crashCounter >= 3 ? 'System approaching failure threshold' : undefined,
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    service: 'incident-sandbox',
    endpoints: ['/health', '/crash'],
    crashCounter,
  });
});

// Startup
console.log('\x1b[36m========================================\x1b[0m');
console.log('\x1b[1m  Incident Sandbox — Microservice v1.0\x1b[0m');
console.log('\x1b[36m========================================\x1b[0m');
console.log(`\x1b[33m[config]\x1b[0m Loading payment gateway...`);
console.log(`\x1b[33m[config]\x1b[0m STRIPE_KEY=${STRIPE_SECRET_KEY}`);
console.log(`\x1b[33m[config]\x1b[0m Payment gateway initialized`);

app.listen(PORT, () => {
  console.log(`\x1b[32m[ready]\x1b[0m Server listening on port ${PORT}`);
  console.log(`\x1b[2mTry: curl localhost:${PORT}/health\x1b[0m`);
});
