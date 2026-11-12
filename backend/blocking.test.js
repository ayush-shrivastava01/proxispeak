const { test } = require("node:test");
const assert = require("node:assert/strict");
const { io: createClient } = require("socket.io-client");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { segmentIntersectsRect, isSoundBlocked } = require("./proximity");
const {
  createMemoryPositionStore,
  createRedisPositionStore,
} = require("./positionStore");

const wall = { x: 100, y: 0, width: 10, height: 100, blocksSound: true };

test("segmentIntersectsRect detects lines crossing, missing and starting inside", () => {
  assert.equal(segmentIntersectsRect({ x: 50, y: 50 }, { x: 160, y: 50 }, wall), true);
  assert.equal(segmentIntersectsRect({ x: 50, y: 150 }, { x: 160, y: 150 }, wall), false);
  assert.equal(segmentIntersectsRect({ x: 50, y: 50 }, { x: 90, y: 50 }, wall), false);
  assert.equal(segmentIntersectsRect({ x: 105, y: 50 }, { x: 160, y: 50 }, wall), true);
  assert.equal(segmentIntersectsRect({ x: 100, y: -20 }, { x: 100, y: 120 }, wall), true);
});

test("isSoundBlocked ignores obstacles that do not block sound", () => {
  const a = { x: 50, y: 50 };
  const b = { x: 160, y: 50 };

  assert.equal(isSoundBlocked(a, b, [wall]), true);
  assert.equal(isSoundBlocked(a, b, [{ ...wall, blocksSound: false }]), false);
  assert.equal(isSoundBlocked(a, b, []), false);
});

// A tiny fake of the node-redis hash commands, to test the Redis store offline.
function createFakeRedis() {
  const hashes = new Map();
  const hash = (key) => {
    if (!hashes.has(key)) hashes.set(key, new Map());
    return hashes.get(key);
  };

  return {
    async hSet(key, field, value) {
      hash(key).set(field, value);
    },
    async hGet(key, field) {
      return hash(key).get(field) ?? null;
    },
    async hDel(key, field) {
      hash(key).delete(field);
    },
    async hGetAll(key) {
      return Object.fromEntries(hash(key));
    },
    async hLen(key) {
      return hash(key).size;
    },
  };
}

for (const [name, makeStore] of [
  ["memory", () => createMemoryPositionStore()],
  ["redis (fake client)", () => createRedisPositionStore(createFakeRedis())],
]) {
  test(`position store works: ${name}`, async () => {
    const store = makeStore();

    await store.set("a", { x: 1, y: 2 });
    await store.set("b", { x: 3, y: 4 });

    assert.deepEqual(await store.get("a"), { x: 1, y: 2 });
    assert.equal(await store.get("missing"), null);
    assert.equal(await store.count(), 2);

    const all = await store.all();
    assert.deepEqual(all.get("b"), { x: 3, y: 4 });

    await store.delete("a");
    assert.equal(await store.get("a"), null);
    assert.equal(await store.count(), 1);
  });
}

function waitFor(socket, eventName, predicate = () => true, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeout);

    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(eventName, handler);
      resolve(payload);
    }

    socket.on(eventName, handler);
  });
}

test("nearbyAvatars marks users behind a sound-blocking obstacle as blocked", async () => {
  const port = 5104;
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: { ...process.env, PORT: String(port), MONGODB_URI: "", REDIS_URL: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let a;
  let b;

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("startup timeout")), 5000);
      child.stdout.on("data", (chunk) => {
        if (chunk.toString().includes(`port ${port}`)) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    const url = `http://127.0.0.1:${port}`;
    a = createClient(url, { transports: ["websocket"] });
    b = createClient(url, { transports: ["websocket"] });
    await Promise.all([waitFor(a, "connect"), waitFor(b, "connect")]);

    // B stays at the start position (450, 300). Put a wall between A and B.
    const saved = waitFor(a, "roomLayout", (room) => room.obstacles.length === 1);
    a.emit("saveRoomLayout", {
      name: "Wall test",
      obstacles: [{ type: "wall", x: 420, y: 250, width: 10, height: 100, blocksSound: true }],
    });
    await saved;

    a.emit("moveAvatar", { x: 400, y: 300 }); // 50 px from B, wall in between
    const blockedList = await waitFor(a, "nearbyAvatars", (list) =>
      list.some((item) => item.userId === b.id)
    );
    assert.equal(blockedList.find((i) => i.userId === b.id).blocked, true);

    // Move A around the wall (above it): the line of sight is free again.
    await new Promise((r) => setTimeout(r, 200));
    a.emit("moveAvatar", { x: 440, y: 230 });
    const clearList = await waitFor(
      a,
      "nearbyAvatars",
      (list) => list.some((item) => item.userId === b.id && item.blocked === false)
    );
    assert.ok(clearList.length >= 1);
    
    // B did not move, but must also see that the wall is no longer between them.
    const clearForB = await waitFor(
      b,
      "nearbyAvatars",
      (list) => list.some((item) => item.userId === a.id && item.blocked === false)
    );
    assert.ok(clearForB.length >= 1);
  } finally {
    a?.close();
    b?.close();
    child.kill();
  }
});