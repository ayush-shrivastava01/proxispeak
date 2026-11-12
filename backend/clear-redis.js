// One-time cleanup: removes all stored avatar positions from Redis.
// Run it while the server is stopped:  node clear-redis.js
require("dotenv").config();
const { createClient } = require("redis");

async function main() {
  if (!process.env.REDIS_URL) {
    console.error("REDIS_URL is not set in backend/.env");
    process.exit(1);
  }

  const client = createClient({ url: process.env.REDIS_URL });
  client.on("error", (error) => console.error("Redis error:", error.message));
  await client.connect();

  const count = await client.hLen("proxispeak:avatars");
  await client.del("proxispeak:avatars");
  console.log(`Removed ${count} stored avatars from Redis.`);

  process.exit(0);
}

main();