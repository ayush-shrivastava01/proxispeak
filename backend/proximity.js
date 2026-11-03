// Proximity helpers for ProxiSpeak.
// Positions are canvas pixels ({ x, y }). The default "earshot" radius is
// 100 px, as required by the project plan.

const PROXIMITY_RADIUS_PX = Number(process.env.PROXIMITY_RADIUS_PX) || 100;

function pixelDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// In-memory version (also used as a fallback when MongoDB is not connected).
// `positions` is a Map<userId, {x, y}>.
function findNearbyInMemory(positions, userId, position, radius = PROXIMITY_RADIUS_PX) {
  const nearby = [];

  for (const [otherId, otherPosition] of positions.entries()) {
    if (otherId === userId) continue;

    const distance = pixelDistance(position, otherPosition);
    if (distance <= radius) {
      nearby.push({ userId: otherId, distance: Number(distance.toFixed(1)) });
    }
  }

  return nearby.sort((a, b) => a.distance - b.distance);
}

// MongoDB version using a geospatial $near query on the 2d index.
async function findNearbyInMongo(Avatar, userId, position, radius = PROXIMITY_RADIUS_PX) {
  const docs = await Avatar.find({
    userId: { $ne: userId },
    location: { $near: [position.x, position.y], $maxDistance: radius },
  })
    .select("userId location")
    .lean();

  // $near returns results already sorted by distance (nearest first).
  return docs.map((doc) => ({
    userId: doc.userId,
    distance: Number(
      pixelDistance(position, { x: doc.location[0], y: doc.location[1] }).toFixed(1)
    ),
  }));
}

module.exports = {
  PROXIMITY_RADIUS_PX,
  pixelDistance,
  findNearbyInMemory,
  findNearbyInMongo,
};