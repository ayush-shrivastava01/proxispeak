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
    socket.disconnect();
});

socket.on("connect_error", (error) => {
    console.log("Connection failed:", error.message);
});