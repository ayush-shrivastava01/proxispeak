try {
  require("dotenv").config(); // optional: loads backend/.env if dotenv is installed
} catch {
  // dotenv not installed: use real environment variables only
}
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const {
  PROXIMITY_RADIUS_PX,
  pixelDistance,
  findNearbyInMemory,
  findNearbyInMongo,
  findClustersInMemory,
  findUsersWithinCircleInMemory,
  findUsersWithinCircleMongo,
} = require("./proximity");
const {
  DEFAULT_ROOM_ID,
  ROOM_ID_PATTERN,
  validateRoomPayload,
  createRoomStore,
} = require("./rooms");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

// World size (canvas pixels) and how often proximity is recalculated per user.
const WORLD_WIDTH = 900;
const WORLD_HEIGHT = 600;
const PROXIMITY_THROTTLE_MS = 100;

// Legacy lat/long nearby feature (kept so older clients keep working).
const NEARBY_DISTANCE_KM = 1;

// Latest avatar positions in memory (authoritative for broadcasting and for
// deciding who may exchange WebRTC signaling messages).
const avatars = new Map();
// Latest shared latitude/longitude (legacy feature).
const users = new Map();
// userId -> Set of userIds currently inside that user's earshot radius.
const nearbySets = new Map();
// userId -> pending throttled proximity timer.
const proximityTimers = new Map();

// ---------------------------------------------------------------------------
// MongoDB (optional). Without MONGODB_URI the server falls back to in-memory
// proximity so that development and tests still work.
// ---------------------------------------------------------------------------
let Avatar = null;
let Room = null;
let dbReady = false;

// Office layouts and obstacles (MongoDB when connected, memory otherwise).
const roomStore = createRoomStore(() => (dbReady ? Room : null));

async function connectDatabase() {
  if (!MONGODB_URI) {
    console.log("MONGODB_URI not set. Using in-memory proximity (no MongoDB).");
    return;
  }

  try {
    const mongoose = require("mongoose");
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

    Avatar = require("./models/Avatar");
    await Avatar.init(); // make sure the 2d geospatial index exists
    Room = require("./models/Room");
    await Room.init();
    await Avatar.deleteMany({}); // clear stale avatars from a previous run

    mongoose.connection.on("disconnected", () => {
      dbReady = false;
      console.warn("MongoDB disconnected. Falling back to in-memory proximity.");
    });
    mongoose.connection.on("connected", () => {
      dbReady = true;
    });

    dbReady = true;
    console.log("MongoDB connected. Using $near geospatial queries.");
  } catch (error) {
    dbReady = false;
    console.error(
      "MongoDB connection failed. Using in-memory proximity:",
      error.message
    );
  }
}

// ---------------------------------------------------------------------------
// Proximity (pixel based, 100 px radius by default)
// ---------------------------------------------------------------------------
async function findNearby(userId, position) {
  if (dbReady && Avatar) {
    try {
      await Avatar.updateOne(
        { userId },
        { $set: { location: [position.x, position.y], updatedAt: new Date() } },
        { upsert: true }
      );
      return await findNearbyInMongo(Avatar, userId, position);
    } catch (error) {
      console.error("MongoDB proximity query failed, using memory:", error.message);
    }
  }

  return findNearbyInMemory(avatars, userId, position);
}

// Recalculate who is near `userId`, tell that user, and tell every user whose
// "nearby" membership changed because of this movement.
async function refreshProximity(userId) {
  const position = avatars.get(userId);
  if (!position) return;

  const nearby = await findNearby(userId, position);
  if (!avatars.has(userId)) return; // user left while the query was running

  const newSet = new Set(nearby.map((item) => item.userId));
  const oldSet = nearbySets.get(userId) || new Set();
  nearbySets.set(userId, newSet);

  io.to(userId).emit("nearbyAvatars", nearby);

  const changed = new Set();
  for (const id of newSet) if (!oldSet.has(id)) changed.add(id);
  for (const id of oldSet) if (!newSet.has(id)) changed.add(id);

  for (const otherId of changed) {
    const otherPosition = avatars.get(otherId);
    if (!otherPosition) continue;

    const otherNearby = findNearbyInMemory(avatars, otherId, otherPosition);
    nearbySets.set(otherId, new Set(otherNearby.map((item) => item.userId)));
    io.to(otherId).emit("nearbyAvatars", otherNearby);
  }
}

function scheduleProximity(userId) {
  if (proximityTimers.has(userId)) return;

  const timer = setTimeout(async () => {
    proximityTimers.delete(userId);
    try {
      await refreshProximity(userId);
    } catch (error) {
      console.error("Proximity update failed:", error.message);
    }
  }, PROXIMITY_THROTTLE_MS);

  proximityTimers.set(userId, timer);
}

// WebRTC signaling is only allowed between users within earshot.
function isWithinEarshot(userIdA, userIdB) {
  const a = avatars.get(userIdA);
  const b = avatars.get(userIdB);
  return Boolean(a && b && pixelDistance(a, b) <= PROXIMITY_RADIUS_PX);
}

// ---------------------------------------------------------------------------
// Legacy latitude/longitude helpers
// ---------------------------------------------------------------------------
function calculateDistance(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getNearbyUsers(userId, location) {
  const nearby = [];

  for (const [otherUserId, otherLocation] of users.entries()) {
    if (otherUserId === userId) continue;

    const distance = calculateDistance(
      location.latitude,
      location.longitude,
      otherLocation.latitude,
      otherLocation.longitude
    );

    if (distance <= NEARBY_DISTANCE_KM) {
      nearby.push({
        userId: otherUserId,
        distanceKm: Number(distance.toFixed(3)),
      });
    }
  }

  return nearby;
}

function refreshNearbyUsers() {
  for (const [userId, location] of users.entries()) {
    io.to(userId).emit("nearbyUsers", getNearbyUsers(userId, location));
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
app.get("/", (_req, res) => {
  res.send("ProxiSpeak Backend is Running!");
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    mongodb: dbReady,
    proximityRadiusPx: PROXIMITY_RADIUS_PX,
    avatars: avatars.size,
  });
});

// Proximity clusters: groups of users who can hear each other.
app.get("/api/clusters", (_req, res) => {
  res.json({
    radius: PROXIMITY_RADIUS_PX,
    clusters: findClustersInMemory(avatars),
  });
});

// Users inside a circle (MongoDB $geoWithin when connected).
// Example: /api/area?x=450&y=300&radius=100
app.get("/api/area", async (req, res) => {
  const x = Number(req.query.x);
  const y = Number(req.query.y);
  const radius =
    req.query.radius === undefined
      ? PROXIMITY_RADIUS_PX
      : Number(req.query.radius);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    radius > 1000
  ) {
    return res
      .status(400)
      .json({ error: "x, y and radius (1 to 1000) must be numbers." });
  }

  const center = { x, y };
  let users;

  if (dbReady && Avatar) {
    try {
      users = await findUsersWithinCircleMongo(Avatar, center, radius);
    } catch (error) {
      console.error("MongoDB $geoWithin failed, using memory:", error.message);
    }
  }

  if (!users) {
    users = findUsersWithinCircleInMemory(avatars, center, radius);
  }

  res.json({ center, radius, users });
});

// Room persistence (office layout and sound-blocking obstacles).
app.get("/api/rooms/:roomId", async (req, res) => {
  if (!ROOM_ID_PATTERN.test(req.params.roomId)) {
    return res.status(400).json({ error: "Invalid room id." });
  }

  res.json(await roomStore.load(req.params.roomId));
});

app.put("/api/rooms/:roomId", async (req, res) => {
  if (!ROOM_ID_PATTERN.test(req.params.roomId)) {
    return res.status(400).json({ error: "Invalid room id." });
  }

  const result = validateRoomPayload(req.body);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  const room = await roomStore.save(req.params.roomId, result.value);
  io.emit("roomLayout", room);
  res.json(room);
});

// ---------------------------------------------------------------------------
// Socket.io
// ---------------------------------------------------------------------------
function currentAvatarList() {
  return Array.from(avatars.entries()).map(([userId, position]) => ({
    userId,
    x: position.x,
    y: position.y,
  }));
}

// Forward a WebRTC signaling message only when the target exists and is
// within earshot of the sender.
function forwardSignal(socket, eventName, payloadKey, payload = {}) {
  const { targetUserId } = payload;
  const data = payload[payloadKey];

  if (
    typeof targetUserId !== "string" ||
    !data ||
    !io.sockets.sockets.has(targetUserId)
  ) {
    return;
  }

  if (!isWithinEarshot(socket.id, targetUserId)) {
    socket.emit("webrtc-out-of-range", { targetUserId });
    return;
  }

  io.to(targetUserId).emit(eventName, {
    senderUserId: socket.id,
    [payloadKey]: data,
  });

  console.log(`${eventName}:`, socket.id, "->", targetUserId);
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  console.log("Total connected users:", io.engine.clientsCount);

  // Send the IDs of other currently connected users.
  socket.on("getConnectedUsers", () => {
    const connectedUsers = Array.from(io.sockets.sockets.keys()).filter(
      (userId) => userId !== socket.id
    );

    socket.emit("connectedUsers", connectedUsers);
  });

  // Send existing avatars to the newly connected user.
  socket.emit("currentAvatars", currentAvatarList());

  // Register and announce the new user's avatar.
  const initialPosition = { x: 450, y: 300 };
  avatars.set(socket.id, initialPosition);

  socket.broadcast.emit("avatarMoved", {
    userId: socket.id,
    x: initialPosition.x,
    y: initialPosition.y,
  });
  scheduleProximity(socket.id);

  // Send the saved office layout to the new user.
  roomStore
    .load(DEFAULT_ROOM_ID)
    .then((room) => socket.emit("roomLayout", room))
    .catch((error) => console.error("Failed to load room:", error.message));

  // Load a saved room layout.
  socket.on("getRoomLayout", async (payload = {}) => {
    const roomId = payload.roomId || DEFAULT_ROOM_ID;

    if (!ROOM_ID_PATTERN.test(roomId)) {
      socket.emit("roomError", { message: "Invalid room id." });
      return;
    }

    socket.emit("roomLayout", await roomStore.load(roomId));
  });

  // Save a room layout and tell every connected user.
  socket.on("saveRoomLayout", async (payload = {}) => {
    const roomId = payload.roomId || DEFAULT_ROOM_ID;

    if (!ROOM_ID_PATTERN.test(roomId)) {
      socket.emit("roomError", { message: "Invalid room id." });
      return;
    }

    const result = validateRoomPayload(payload);
    if (result.error) {
      socket.emit("roomError", { message: result.error });
      return;
    }

    io.emit("roomLayout", await roomStore.save(roomId, result.value));
  });

  // Send the current avatar list when requested by the frontend.
  socket.on("getAvatars", () => {
    socket.emit("currentAvatars", currentAvatarList());
  });

  // Current list of users inside earshot (pixel radius).
  socket.on("getNearbyAvatars", async () => {
    const position = avatars.get(socket.id);
    if (!position) return;

    socket.emit("nearbyAvatars", await findNearby(socket.id, position));
  });

    // Proximity clusters (groups of users within earshot of each other).
  socket.on("getClusters", () => {
    socket.emit("proximityClusters", {
      radius: PROXIMITY_RADIUS_PX,
      clusters: findClustersInMemory(avatars),
    });
  });

  // WebRTC signaling (only within earshot).
  socket.on("webrtc-offer", (payload) =>
    forwardSignal(socket, "webrtc-offer", "offer", payload)
  );
  socket.on("webrtc-answer", (payload) =>
    forwardSignal(socket, "webrtc-answer", "answer", payload)
  );
  socket.on("webrtc-ice-candidate", (payload) =>
    forwardSignal(socket, "webrtc-ice-candidate", "candidate", payload)
  );

  // Handle avatar movement and store the latest position.
  socket.on("moveAvatar", (position) => {
    if (
      !position ||
      typeof position.x !== "number" ||
      typeof position.y !== "number" ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      return;
    }

    const safePosition = {
      x: Math.max(0, Math.min(WORLD_WIDTH, position.x)),
      y: Math.max(0, Math.min(WORLD_HEIGHT, position.y)),
    };

    avatars.set(socket.id, safePosition);

    socket.broadcast.emit("avatarMoved", {
      userId: socket.id,
      ...safePosition,
    });

    scheduleProximity(socket.id);
  });

  // Legacy: latitude/longitude sharing and nearby-user detection.
  socket.on("shareLocation", (location) => {
    if (
      !location ||
      typeof location.latitude !== "number" ||
      typeof location.longitude !== "number" ||
      !Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude) ||
      Math.abs(location.latitude) > 90 ||
      Math.abs(location.longitude) > 180
    ) {
      socket.emit("locationError", {
        message: "Invalid latitude or longitude.",
      });
      return;
    }

    users.set(socket.id, {
      latitude: location.latitude,
      longitude: location.longitude,
    });

    socket.emit("nearbyUsers", getNearbyUsers(socket.id, location));
    refreshNearbyUsers();
  });

  // Remove the disconnected user's data and notify other clients.
  socket.on("disconnect", () => {
    clearTimeout(proximityTimers.get(socket.id));
    proximityTimers.delete(socket.id);

    users.delete(socket.id);
    avatars.delete(socket.id);

    const previouslyNearby = nearbySets.get(socket.id) || new Set();
    nearbySets.delete(socket.id);

    if (dbReady && Avatar) {
      Avatar.deleteOne({ userId: socket.id }).catch((error) =>
        console.error("Failed to delete avatar:", error.message)
      );
    }

    socket.broadcast.emit("avatarLeft", { userId: socket.id });

    // Users who could hear the leaving user get an updated list.
    for (const otherId of previouslyNearby) {
      const otherPosition = avatars.get(otherId);
      if (!otherPosition) continue;

      const otherNearby = findNearbyInMemory(avatars, otherId, otherPosition);
      nearbySets.set(otherId, new Set(otherNearby.map((item) => item.userId)));
      io.to(otherId).emit("nearbyAvatars", otherNearby);
    }

    refreshNearbyUsers();
    console.log("User disconnected:", socket.id);
  });
});

connectDatabase().finally(() => {
  server.listen(PORT, () => {
    console.log(`ProxiSpeak server running on port ${PORT}`);
  });
});