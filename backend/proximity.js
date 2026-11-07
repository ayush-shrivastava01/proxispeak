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

// Group users into proximity clusters: two users are in the same cluster when
// they are within `radius` of each other, directly or through a chain of users.
// Only clusters with at least two users are returned (largest first).
function findClustersInMemory(positions, radius = PROXIMITY_RADIUS_PX) {
  const ids = Array.from(positions.keys());
  const parent = new Map(ids.map((id) => [id, id]));

  function find(id) {
    while (parent.get(id) !== id) {
      parent.set(id, parent.get(parent.get(id)));
      id = parent.get(id);
    }
    return id;
  }

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (pixelDistance(positions.get(ids[i]), positions.get(ids[j])) <= radius) {
        parent.set(find(ids[i]), find(ids[j]));
      }
    }
  }

  const groups = new Map();
  for (const id of ids) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }

  return Array.from(groups.values())
    .filter((group) => group.length >= 2)
    .sort((a, b) => b.length - a.length);
}

// All users inside a circle (in memory).
function findUsersWithinCircleInMemory(positions, center, radius = PROXIMITY_RADIUS_PX) {
  const users = [];

  for (const [userId, position] of positions.entries()) {
    if (pixelDistance(center, position) <= radius) {
      users.push({ userId, x: position.x, y: position.y });
    }
  }

  return users;
}

// All users inside a circle using a MongoDB $geoWithin query on the 2d index.
async function findUsersWithinCircleMongo(Avatar, center, radius = PROXIMITY_RADIUS_PX) {
  const docs = await Avatar.find({
    location: { $geoWithin: { $center: [[center.x, center.y], radius] } },
  })
    .select("userId location")
    .lean();

  return docs.map((doc) => ({
    userId: doc.userId,
    x: doc.location[0],
    y: doc.location[1],
  }));
}

// Does the straight line between a and b cross the rectangle? (Liang-Barsky)
function segmentIntersectsRect(a, b, rect) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [
    a.x - rect.x,
    rect.x + rect.width - a.x,
    a.y - rect.y,
    rect.y + rect.height - a.y,
  ];

  let t0 = 0;
  let t1 = 1;

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false; // parallel to this edge and outside
    } else {
      const r = q[i] / p[i];

      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }

  return true;
}

// True when a sound-blocking obstacle lies between the two avatars.
function isSoundBlocked(a, b, obstacles) {
  return obstacles.some(
    (obstacle) =>
      obstacle.blocksSound !== false && segmentIntersectsRect(a, b, obstacle)
  );
}

module.exports = {
  segmentIntersectsRect,
  isSoundBlocked,
  PROXIMITY_RADIUS_PX,
  pixelDistance,
  findNearbyInMemory,
  findNearbyInMongo,
  findClustersInMemory,
  findUsersWithinCircleInMemory,
  findUsersWithinCircleMongo,
};


