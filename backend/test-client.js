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