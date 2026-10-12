const { io } = require("socket.io-client");

const socket = io("http://localhost:5000", {
    transports: ["websocket"],
    reconnection: false,
    timeout: 10000
});

socket.on("connect", () => {
    console.log("Second user connected:", socket.id);

    socket.emit("shareLocation", {
        latitude: 22.5730,
        longitude: 88.3642
    });

    console.log("Second user's location sent.");
});

socket.on("nearbyUsers", (nearbyUsers) => {
    console.log("Nearby users:", nearbyUsers);
});

// Receive avatar movement from another user
socket.on("avatarMoved", (data) => {
    console.log("Avatar movement received:", data);
});

socket.on("connect_error", (error) => {
    console.log("Connection failed:", error.message);
});
// Receive WebRTC offer
socket.on("webrtc-offer", (data) => {
    console.log("WebRTC offer received:", data);

    // Send test answer back to the first user
    socket.emit("webrtc-answer", {
        targetUserId: data.senderUserId,
        answer: {
            type: "answer",
            sdp: "test-answer"
        }
    });

    console.log("WebRTC test answer sent!");
});
// Receive ICE candidate
socket.on("webrtc-ice-candidate", (data) => {
    console.log("ICE candidate received:", data);
});