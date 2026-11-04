const { test } = require("node:test");
const assert = require("node:assert/strict");
const { io: createClient } = require("socket.io-client");
const { spawn } = require("node:child_process");
const path = require("node:path");
const {
  findNearbyInMemory,
  findClustersInMemory,
  findUsersWithinCircleInMemory,
  pixelDistance,
  PROXIMITY_RADIUS_PX,
} = require("./proximity");

const TEST_PORT = 5102;
const TEST_URL = `http://127.0.0.1:${TEST_PORT}`;

test("pixelDistance and findNearbyInMemory use a 100 px radius", () => {
  assert.equal(PROXIMITY_RADIUS_PX, 100);
  assert.equal(pixelDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);

  const positions = new Map([
    ["me", { x: 100, y: 100 }],
    ["near", { x: 150, y: 100 }],
    ["edge", { x: 200, y: 100 }],
    ["far", { x: 201, y: 100 }],
  ]);

  const result = findNearbyInMemory(positions, "me", positions.get("me"));
  assert.deepEqual(
    result.map((item) => item.userId),
    ["near", "edge"]
  );
});

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

test("signaling is blocked outside 100 px and allowed inside", async () => {
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: { ...process.env, PORT: String(TEST_PORT), MONGODB_URI: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let a;
  let b;

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("startup timeout")), 5000);
      child.stdout.on("data", (chunk) => {
        if (chunk.toString().includes(`port ${TEST_PORT}`)) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    a = createClient(TEST_URL, { transports: ["websocket"] });
    b = createClient(TEST_URL, { transports: ["websocket"] });
    await Promise.all([waitFor(a, "connect"), waitFor(b, "connect")]);

    // Move A far away from B (B stays at the start position 450,300).
    a.emit("moveAvatar", { x: 50, y: 50 });
    await new Promise((r) => setTimeout(r, 300));

    const blocked = waitFor(a, "webrtc-out-of-range");
    a.emit("webrtc-offer", { targetUserId: b.id, offer: { sdp: "x" } });
    await blocked;

    // Move A next to B (60 px away): offer must now be delivered.
    a.emit("moveAvatar", { x: 450, y: 360 });
    const nearbyForA = await waitFor(
      a,
      "nearbyAvatars",
      (list) => list.some((item) => item.userId === b.id)
    );
    assert.equal(nearbyForA[0].distance, 60);

    const delivered = waitFor(b, "webrtc-offer");
    a.emit("webrtc-offer", { targetUserId: b.id, offer: { sdp: "x" } });
    const message = await delivered;
    assert.equal(message.senderUserId, a.id);
  } finally {
    a?.close();
    b?.close();
    child.kill();
  }
});


test("findClustersInMemory groups users, including chains of neighbours", () => {
  const positions = new Map([
    ["a", { x: 100, y: 100 }],
    ["b", { x: 180, y: 100 }], // 80 px from a
    ["c", { x: 260, y: 100 }], // 80 px from b, 160 px from a (chain)
    ["d", { x: 700, y: 500 }],
    ["e", { x: 750, y: 500 }], // 50 px from d
    ["f", { x: 400, y: 300 }], // alone
  ]);

  const clusters = findClustersInMemory(positions);

  assert.equal(clusters.length, 2);
  assert.deepEqual([...clusters[0]].sort(), ["a", "b", "c"]);
  assert.deepEqual([...clusters[1]].sort(), ["d", "e"]);
});

test("findUsersWithinCircleInMemory returns users inside a circle", () => {
  const positions = new Map([
    ["in", { x: 110, y: 100 }],
    ["edge", { x: 200, y: 100 }],
    ["out", { x: 201, y: 100 }],
  ]);

  const users = findUsersWithinCircleInMemory(positions, { x: 100, y: 100 }, 100);
  assert.deepEqual(users.map((u) => u.userId).sort(), ["edge", "in"]);
});