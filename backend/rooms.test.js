const { test } = require("node:test");
const assert = require("node:assert/strict");
const { io: createClient } = require("socket.io-client");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { validateRoomPayload, createRoomStore } = require("./rooms");

test("validateRoomPayload accepts good obstacles and rejects bad ones", () => {
  const good = validateRoomPayload({
    name: " Main Office ",
    obstacles: [{ type: "desk", x: 100, y: 100, width: 80, height: 40 }],
  });
  assert.equal(good.value.name, "Main Office");
  assert.equal(good.value.obstacles[0].blocksSound, true);

  assert.ok(validateRoomPayload(null).error);
  assert.ok(validateRoomPayload({ obstacles: "x" }).error);
  assert.ok(
    validateRoomPayload({
      obstacles: [{ x: 850, y: 10, width: 100, height: 10 }],
    }).error
  );
  assert.ok(
    validateRoomPayload({
      obstacles: [{ x: "1", y: 10, width: 10, height: 10 }],
    }).error
  );
});

test("room store saves and loads a room (memory mode)", async () => {
  const store = createRoomStore(() => null);

  const empty = await store.load("office-1");
  assert.deepEqual(empty.obstacles, []);

  await store.save("office-1", {
    name: "Office",
    obstacles: [{ type: "wall", x: 0, y: 0, width: 10, height: 200, blocksSound: true }],
  });

  const loaded = await store.load("office-1");
  assert.equal(loaded.obstacles.length, 1);
  assert.equal(loaded.obstacles[0].type, "wall");
});

test("server saves a room over sockets and sends it to a new user", async () => {
  const port = 5103;
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

    a = createClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    const saved = new Promise((resolve) => {
      a.on("roomLayout", (room) => {
        if (room.obstacles.length === 1) resolve(room);
      });
    });

    a.emit("saveRoomLayout", {
      name: "Test Office",
      obstacles: [{ type: "desk", x: 100, y: 100, width: 80, height: 40 }],
    });
    const room = await saved;
    assert.equal(room.name, "Test Office");

    // A user who connects later receives the saved layout automatically.
    b = createClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    const received = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no roomLayout")), 4000);
      b.on("roomLayout", (r) => {
        clearTimeout(timer);
        resolve(r);
      });
    });
    assert.equal(received.obstacles.length, 1);
  } finally {
    a?.close();
    b?.close();
    child.kill();
  }
});