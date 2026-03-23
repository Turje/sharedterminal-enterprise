// Simple in-memory rate limiter
const hits = new Map();

function rateLimit(req, maxRequests = 10, windowMs = 60000) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  if (!hits.has(ip)) {
    hits.set(ip, []);
  }

  const timestamps = hits.get(ip).filter(t => now - t < windowMs);
  timestamps.push(now);
  hits.set(ip, timestamps);

  return timestamps.length <= maxRequests;
}

module.exports = { rateLimit };
