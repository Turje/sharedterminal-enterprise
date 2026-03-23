const http = require('http');
const { rateLimit } = require('./rate-limit');
const { getUser } = require('./users');

const server = http.createServer((req, res) => {
  if (!rateLimit(req)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Too many requests' }));
  }

  if (req.url === '/api/users') {
    const users = [
      getUser(1),
      getUser(2),
      getUser(3),
    ];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(users));
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`acme-api running on port ${PORT}`);
});
