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
        methods: ["GET", "POST"]
    },
    transports: ["websocket", "polling"]
});

const PORT = 5000;

// Store connected users' locations in memory
const users = new Map();

app.get("/", (req, res) => {
    res.send("ProxiSpeak Backend is Running!");
});

// Calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
    const earthRadius = 6371;

    const toRadians = (degrees) => degrees * Math.PI / 180;

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * c;
}

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

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
                message: "Invalid latitude or longitude."
            });
            return;
        }

        // Save this user's latest location
        users.set(socket.id, {
            latitude: location.latitude,
            longitude: location.longitude
        });

        console.log("Location received from:", socket.id);
        console.log("Latitude:", location.latitude);
        console.log("Longitude:", location.longitude);

        // Find users within 1 kilometer
        const nearbyUsers = [];

        for (const [userId, userLocation] of users.entries()) {
            if (userId === socket.id) {
                continue;
            }

            const distance = calculateDistance(
                location.latitude,
                location.longitude,
                userLocation.latitude,
                userLocation.longitude
            );

            if (distance <= 1) {
                nearbyUsers.push({
                    userId,
                    distanceKm: Number(distance.toFixed(3))
                });
            }
        }

        // Send nearby-user results to this user
socket.emit("nearbyUsers", nearbyUsers);

// Broadcast updated nearby users to other connected users
for (const [userId, userLocation] of users.entries()) {
    if (userId === socket.id) {
        continue;
    }

    const updatedNearbyUsers = [];

    for (const [otherUserId, otherLocation] of users.entries()) {
        if (otherUserId === userId) {
            continue;
        }

        const distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            otherLocation.latitude,
            otherLocation.longitude
        );

        if (distance <= 1) {
            updatedNearbyUsers.push({
                userId: otherUserId,
                distanceKm: Number(distance.toFixed(3))
            });
        }
    }

    io.to(userId).emit("nearbyUsers", updatedNearbyUsers);
}

console.log("Nearby users found:", nearbyUsers.length);
    });

    socket.on("disconnect", () => {
    // Remove disconnected user's location
    users.delete(socket.id);

    console.log("User disconnected:", socket.id);

    // Update nearby users for all remaining connected users
    for (const [userId, userLocation] of users.entries()) {
        const updatedNearbyUsers = [];

        for (const [otherUserId, otherLocation] of users.entries()) {
            if (userId === otherUserId) {
                continue;
            }

            const distance = calculateDistance(
                userLocation.latitude,
                userLocation.longitude,
                otherLocation.latitude,
                otherLocation.longitude
            );

            if (distance <= 1) {
                updatedNearbyUsers.push({
                    userId: otherUserId,
                    distanceKm: Number(distance.toFixed(3))
                });
            }
        }

        io.to(userId).emit("nearbyUsers", updatedNearbyUsers);
    }

    console.log("Nearby user lists updated after disconnect.");
});
});

server.listen(PORT, () => {
    console.log(`ProxiSpeak server running on port ${PORT}`);
});