// Benchmark for the Mid Review requirement: proximity filtering and
// clustering under 20 ms.
//
//   node benchmark-proximity.js
//
// It reports THREE numbers so the result is honest and easy to explain:
//  1. Server-side query time  : time MongoDB itself needs to run the $near query
//                               (executionTimeMillis from explain()).
//  2. Round-trip time         : query time as seen by Node, INCLUDING the
//                               network trip to the database (large with a
//                               remote Atlas cluster).
//  3. In-memory clustering    : the same proximity filter on the server's
//                               in-memory avatar Map (no network).

try {
  require("dotenv").config();
} catch {
  // dotenv is optional
}

const mongoose = require("mongoose");
const Avatar = require("./models/Avatar");
const {
  findNearbyInMongo,
  findNearbyInMemory,
  PROXIMITY_RADIUS_PX,
} = require("./proximity");

const USERS = Number(process.env.BENCH_USERS) || 50;
const QUERIES = Number(process.env.BENCH_QUERIES) || 300;

function summarize(label, values) {
  const sorted = [...values].sort((a, b) => a - b);
  const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const max = sorted[sorted.length - 1];
  console.log(
    `${label.padEnd(26)} avg ${avg.toFixed(2)} ms | p95 ${p95.toFixed(2)} ms | max ${max.toFixed(2)} ms`
  );
  return { avg, p95, max };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("Set MONGODB_URI first.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  await Avatar.init();
  await Avatar.deleteMany({ userId: /^bench-/ });

  const docs = Array.from({ length: USERS }, (_, i) => ({
    userId: `bench-${i}`,
    location: [Math.random() * 900, Math.random() * 600],
  }));
  await Avatar.insertMany(docs);

  const positions = new Map(
    docs.map((d) => [d.userId, { x: d.location[0], y: d.location[1] }])
  );

  const roundTrip = [];
  const serverSide = [];
  const inMemory = [];

  // Warm-up (first queries are slower because of connection setup).
  for (let i = 0; i < 20; i++) {
    const me = positions.get(docs[i % USERS].userId);
    await findNearbyInMongo(Avatar, docs[i % USERS].userId, me);
  }

  for (let i = 0; i < QUERIES; i++) {
    const id = docs[i % USERS].userId;
    const me = positions.get(id);

    // 1 + 2: round trip, then server-side execution time from explain().
    const start = process.hrtime.bigint();
    await findNearbyInMongo(Avatar, id, me, PROXIMITY_RADIUS_PX);
    roundTrip.push(Number(process.hrtime.bigint() - start) / 1e6);

    const plan = await Avatar.find({
      userId: { $ne: id },
      location: { $near: [me.x, me.y], $maxDistance: PROXIMITY_RADIUS_PX },
    }).explain("executionStats");
    const stats = plan.executionStats || plan?.queryPlanner?.executionStats;
    if (stats && typeof stats.executionTimeMillis === "number") {
      serverSide.push(stats.executionTimeMillis);
    }

    // 3: in-memory clustering (no network).
    const memStart = process.hrtime.bigint();
    findNearbyInMemory(positions, id, me, PROXIMITY_RADIUS_PX);
    inMemory.push(Number(process.hrtime.bigint() - memStart) / 1e6);
  }

  console.log(`\nUsers: ${USERS}, queries: ${QUERIES}, radius: ${PROXIMITY_RADIUS_PX}px\n`);
  if (serverSide.length) summarize("MongoDB server-side time", serverSide);
  else console.log("MongoDB server-side time   (explain stats not available)");
  const rt = summarize("Round trip (with network)", roundTrip);
  summarize("In-memory clustering", inMemory);

  console.log(
    `\nHost: ${mongoose.connection.host}. Round trip includes network latency to the database.`
  );
  console.log(
    rt.p95 < 20
      ? "Round-trip p95 is under 20 ms."
      : "Round-trip p95 is over 20 ms (mostly network latency; compare with server-side time above)."
  );

  await Avatar.deleteMany({ userId: /^bench-/ });
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});