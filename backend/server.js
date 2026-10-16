const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

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

const PORT = 5000;
const NEARBY_DISTANCE_KM = 1;

// Store connected users' locations and avatar positions in memory.
const users = new Map();
const avatars = new Map();

app.get("/", (_req, res) => {
  res.send("ProxiSpeak Backend is Running!");
});

// Calculate distance between two geographical coordinates.
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

// Find users within the configured distance.
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

// Refresh nearby-user lists for all users who shared a location.
function refreshNearbyUsers() {
  for (const [userId, location] of users.entries()) {
    io.to(userId).emit(
      "nearbyUsers",
      getNearbyUsers(userId, location)
    );
  }
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  console.log("Total connected users:", io.engine.clientsCount);

 // Send existing avatars to the newly connected user.
socket.emit(
  "currentAvatars",
  Array.from(avatars.entries()).map(([userId, position]) => ({
    userId,
    x: position.x,
    y: position.y,
  }))
);

// Register and announce the new user's avatar.
const initialPosition = { x: 450, y: 300 };

avatars.set(socket.id, initialPosition);

socket.broadcast.emit("avatarMoved", {
  userId: socket.id,
  x: initialPosition.x,
  y: initialPosition.y,
});
// Send the current avatar list when requested by the frontend.
socket.on("getAvatars", () => {
  socket.emit(
    "currentAvatars",
    Array.from(avatars.entries()).map(([userId, position]) => ({
      userId,
      x: position.x,
      y: position.y,
    }))
  );
});

  // WebRTC: Forward an offer to the intended connected user.
  socket.on("webrtc-offer", (payload = {}) => {
    const { targetUserId, offer } = payload;

    if (
      typeof targetUserId !== "string" ||
      !offer ||
      !io.sockets.sockets.has(targetUserId)
    ) {
      return;
    }

    io.to(targetUserId).emit("webrtc-offer", {
      senderUserId: socket.id,
      offer,
    });

    console.log("WebRTC offer sent:", socket.id, "->", targetUserId);
  });

  // WebRTC: Forward an answer to the intended connected user.
  socket.on("webrtc-answer", (payload = {}) => {
    const { targetUserId, answer } = payload;

    if (
      typeof targetUserId !== "string" ||
      !answer ||
      !io.sockets.sockets.has(targetUserId)
    ) {
      return;
    }

    io.to(targetUserId).emit("webrtc-answer", {
      senderUserId: socket.id,
      answer,
    });

    console.log("WebRTC answer sent:", socket.id, "->", targetUserId);
  });

  // WebRTC: Forward ICE candidates.
  socket.on("webrtc-ice-candidate", (payload = {}) => {
    const { targetUserId, candidate } = payload;

    if (
      typeof targetUserId !== "string" ||
      !candidate ||
      !io.sockets.sockets.has(targetUserId)
    ) {
      return;
    }

    io.to(targetUserId).emit("webrtc-ice-candidate", {
      senderUserId: socket.id,
      candidate,
    });

    console.log("ICE candidate sent:", socket.id, "->", targetUserId);
  });

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
      x: Math.max(0, Math.min(900, position.x)),
      y: Math.max(0, Math.min(600, position.y)),
    };

    avatars.set(socket.id, safePosition);

    socket.broadcast.emit("avatarMoved", {
      userId: socket.id,
      ...safePosition,
    });
  });

  // Handle location sharing and nearby-user detection.
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

    console.log("Location received from:", socket.id);

    socket.emit(
      "nearbyUsers",
      getNearbyUsers(socket.id, location)
    );

    refreshNearbyUsers();
  });

  // Remove the disconnected user's data and notify other clients.
  socket.on("disconnect", () => {
    users.delete(socket.id);
    avatars.delete(socket.id);

    socket.broadcast.emit("avatarLeft", {
  userId: socket.id,
});

    refreshNearbyUsers();

    console.log("User disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`ProxiSpeak server running on port ${PORT}`);
});