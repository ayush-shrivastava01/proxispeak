// Load test: many fake users connect, walk around and send positions.
//
//   Start the server first (npm start), then:
//   node loadtest.js            -> 50 users for 15 seconds
//   node loadtest.js 100 30     -> 100 users for 30 seconds
//   node loadtest.js 50 15 http://localhost:5000
//
// It prints how many users connected, how fast the server answers
// (round-trip time of a getAvatars request), how many events were received,
// and the server memory before and after (from /health).

const { io } = require("socket.io-client");

const USERS = Number(process.argv[2]) || 50;
const SECONDS = Number(process.argv[3]) || 15;
const URL = process.argv[4] || "http://localhost:5000";

const sockets = [];
const latencies = [];
let connected = 0;
let failed = 0;
let eventsReceived = 0;
let movesSent = 0;

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function health() {
  try {
    return await (await fetch(`${URL}/health`)).json();
  } catch {
    return null;
  }
}

async function main() {
  const before = await health();
  if (!before) {
    console.error(`Cannot reach ${URL}/health. Start the server first (npm start).`);
    process.exit(1);
  }

  console.log(`Starting ${USERS} users for ${SECONDS} seconds against ${URL} ...`);

  for (let i = 0; i < USERS; i++) {
    const socket = io(URL, { transports: ["websocket"], reconnection: false });
    sockets.push(socket);

    socket.onAny(() => {
      eventsReceived++;
    });
    socket.on("connect", () => {
      connected++;
    });
    socket.on("connect_error", () => {
      failed++;
    });
  }

  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Every user walks randomly and sends its position 10 times per second.
  const positions = sockets.map(() => ({
    x: 100 + Math.random() * 700,
    y: 100 + Math.random() * 400,
  }));

  const mover = setInterval(() => {
    sockets.forEach((socket, i) => {
      if (!socket.connected) return;
      const p = positions[i];
      p.x = Math.max(40, Math.min(860, p.x + (Math.random() - 0.5) * 30));
      p.y = Math.max(65, Math.min(535, p.y + (Math.random() - 0.5) * 30));
      socket.emit("moveAvatar", { x: p.x, y: p.y });
      movesSent++;
    });
  }, 100);

  // Measure how quickly the server answers while it is busy.
  const prober = io(URL, { transports: ["websocket"], reconnection: false });
  const probe = setInterval(() => {
    if (!prober.connected) return;
    const start = process.hrtime.bigint();
    prober.once("currentAvatars", () => {
      latencies.push(Number(process.hrtime.bigint() - start) / 1e6);
    });
    prober.emit("getAvatars");
  }, 250);

  await new Promise((resolve) => setTimeout(resolve, SECONDS * 1000));

  clearInterval(mover);
  clearInterval(probe);

  const during = await health();
  sockets.forEach((socket) => socket.close());
  prober.close();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const after = await health();

  const sorted = latencies.sort((a, b) => a - b);
  const avg = sorted.reduce((s, v) => s + v, 0) / (sorted.length || 1);

  console.log("\n--- Load test result ---");
  console.log(`Users connected:        ${connected} of ${USERS} (failed: ${failed})`);
  console.log(`Avatars on the server:  ${during?.avatars} (while running)`);
  console.log(`Positions sent:         ${movesSent} (about ${Math.round(movesSent / SECONDS)} per second)`);
  console.log(`Events received:        ${eventsReceived} (about ${Math.round(eventsReceived / SECONDS)} per second)`);
  console.log(`Server answer time:     avg ${avg.toFixed(1)} ms | p95 ${percentile(sorted, 0.95).toFixed(1)} ms | max ${(sorted[sorted.length - 1] || 0).toFixed(1)} ms`);
  console.log(`Server memory:          ${before.memoryMb} MB before, ${during?.memoryMb} MB during, ${after?.memoryMb} MB after`);
  console.log(`Avatars after stopping: ${after?.avatars} (should be 0)`);

  process.exit(0);
}

main();