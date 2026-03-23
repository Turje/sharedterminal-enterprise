const { rateLimit } = require('./rate-limit');
const { getUser, listUsers } = require('./users');

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } else {
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    failed++;
  }
}

console.log('\nRunning tests...\n');

// User tests
assert(getUser(1).name === 'Alice', 'getUser returns Alice');
assert(getUser(1).role === 'admin', 'Alice is admin');
assert(getUser(99) === null, 'unknown user returns null');
assert(listUsers().length === 3, 'listUsers returns 3 users');

// Rate limit tests
const mockReq = { socket: { remoteAddress: '127.0.0.1' } };
assert(rateLimit(mockReq, 2, 1000) === true, 'first request passes');
assert(rateLimit(mockReq, 2, 1000) === true, 'second request passes');
assert(rateLimit(mockReq, 2, 1000) === false, 'third request blocked');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
