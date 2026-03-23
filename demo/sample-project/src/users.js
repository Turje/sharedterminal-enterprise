// User store
const users = {
  1: { id: 1, name: 'Alice', role: 'admin' },
  2: { id: 2, name: 'Bob', role: 'developer' },
  3: { id: 3, name: 'Charlie', role: 'viewer' },
};

function getUser(id) {
  return users[id] || null;
}

function listUsers() {
  return Object.values(users);
}

module.exports = { getUser, listUsers };
