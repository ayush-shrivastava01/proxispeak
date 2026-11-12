// Where avatar positions are kept.
//  - Memory store: default, one server process.
//  - Redis store : shared by several server processes (used when REDIS_URL is set).
// Both have the same async API so server.js does not care which one it uses.

function createMemoryPositionStore() {
  const positions = new Map();

  return {
    kind: "memory",
    async set(userId, position) {
      positions.set(userId, { x: position.x, y: position.y });
    },
    async get(userId) {
      const position = positions.get(userId);
      return position ? { ...position } : null;
    },
    async delete(userId) {
      positions.delete(userId);
    },
    async all() {
      return new Map(
        Array.from(positions.entries()).map(([id, p]) => [id, { ...p }])
      );
    },
    async count() {
      return positions.size;
    },
  };
}

// `client` is a node-redis (v4) client that is already connected.
function createRedisPositionStore(client, key = "proxispeak:avatars") {
  return {
    kind: "redis",
    async set(userId, position) {
      await client.hSet(
        key,
        userId,
        JSON.stringify({ x: position.x, y: position.y })
      );
    },
    async get(userId) {
      const raw = await client.hGet(key, userId);
      return raw ? JSON.parse(raw) : null;
    },
    async delete(userId) {
      await client.hDel(key, userId);
    },
    async all() {
      const raw = await client.hGetAll(key);
      return new Map(
        Object.entries(raw).map(([id, value]) => [id, JSON.parse(value)])
      );
    },
    async count() {
      return client.hLen(key);
    },
  };
}

module.exports = { createMemoryPositionStore, createRedisPositionStore };