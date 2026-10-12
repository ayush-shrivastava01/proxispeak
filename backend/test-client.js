const { io } = require("socket.io-client");

const socket = io("http://localhost:5000", {
    transports: ["websocket"],
    reconnection: false,
    timeout: 10000
});

socket.on("connect", () => {
    console.log("Connected to ProxiSpeak server!");
    console.log("Socket ID:", socket.id);

    // Sample location for testing
    const location = {
        latitude: 22.5726,
        longitude: 88.3639
    };

    socket.emit("shareLocation", location);

    console.log("Location sent:");
    console.log("Latitude:", location.latitude);
    console.log("Longitude:", location.longitude);

    // Test avatar movement
socket.emit("moveAvatar", {
    x: 100,
    y: 200
});

console.log("Avatar movement sent!");

// Test WebRTC offer forwarding
socket.emit("webrtc-offer", {
    targetUserId: "w0HXZcoq8foUD1eWAAAD",
    offer: {
        type: "offer",
        sdp: "test-offer"
    }
});

console.log("WebRTC test offer sent!");
// Send test ICE candidate to the second user
socket.emit("webrtc-ice-candidate", {
    targetUserId: "w0HXZcoq8foUD1eWAAAD",
    candidate: {
        candidate: "test-ice-candidate",
        sdpMid: "0",
        sdpMLineIndex: 0
    }
});

console.log("WebRTC test ICE candidate sent!");
});

socket.on("nearbyUsers", (nearbyUsers) => {
    console.log("\nNearby users within 1 km:");
    console.log(nearbyUsers);

    if (nearbyUsers.length === 0) {
        console.log("No nearby users found.");
    }

});

socket.on("locationError", (error) => {
    console.log("Location error:", error.message);
});

socket.on("connect_error", (error) => {
    console.log("Connection failed:", error.message);
});
// Receive WebRTC answer
socket.on("webrtc-answer", (data) => {
    console.log("WebRTC answer received:", data);
});

// Receive ICE candidate
socket.on("webrtc-ice-candidate", (data) => {
    console.log("ICE candidate received:", data);
});