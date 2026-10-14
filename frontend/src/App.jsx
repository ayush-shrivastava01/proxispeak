import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const SERVER_URL = "http://localhost:5000";

export default function App() {
  const canvasRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");
  const [userCount, setUserCount] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    const player = { x: 450, y: 300 };
    const remotePlayers = new Map();
    const keys = new Set();

    let animationId;
    let lastSentX = player.x;
    let lastSentY = player.y;

    const socket = io(SERVER_URL);

    function updateUserCount() {
      setUserCount(remotePlayers.size + 1);
    }

    function drawDesk(x, y) {
      ctx.fillStyle = "#b89570";
      ctx.fillRect(x, y, 110, 60);

      ctx.fillStyle = "#574638";
      ctx.fillRect(x + 12, y + 8, 86, 42);

      ctx.fillStyle = "#9ed9ed";
      ctx.fillRect(x + 34, y - 22, 42, 26);
    }

    function drawAvatar(x, y, label, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x - 13, y - 2, 26, 28);

      ctx.fillStyle = "#f0bd91";
      ctx.beginPath();
      ctx.arc(x, y - 15, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#44332d";
      ctx.beginPath();
      ctx.arc(x, y - 19, 13, Math.PI, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#172033";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.fillText(label, x, y + 43);
    }

    function drawOffice() {
      ctx.fillStyle = "#eee8dc";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "#ddd4c5";

      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      ctx.fillStyle = "#64748b";
      ctx.fillRect(0, 0, canvas.width, 16);
      ctx.fillRect(0, 0, 16, canvas.height);
      ctx.fillRect(canvas.width - 16, 0, 16, canvas.height);
      ctx.fillRect(0, canvas.height - 16, canvas.width, 16);

      drawDesk(80, 110);
      drawDesk(280, 110);
      drawDesk(680, 110);
      drawDesk(80, 420);
      drawDesk(680, 420);

      ctx.fillStyle = "#39865b";

      [[55, 65], [835, 65], [835, 515]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#a66a45";
        ctx.fillRect(x - 12, y + 12, 24, 17);

        ctx.fillStyle = "#39865b";
      });

      ctx.fillStyle = "#475569";
      ctx.font = "bold 16px Arial";
      ctx.textAlign = "left";
      ctx.fillText("PROXISPEAK OFFICE", 35, 45);

      // Draw the local avatar
      drawAvatar(player.x, player.y, "You", "#4169e1");

      // Draw all connected remote avatars
      for (const remotePlayer of remotePlayers.values()) {
        drawAvatar(
          remotePlayer.x,
          remotePlayer.y,
          "Guest",
          "#e05252"
        );
      }
    }

    function onKeyDown(event) {
      const key = event.key.toLowerCase();

      if (
        [
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "w",
          "a",
          "s",
          "d",
        ].includes(key)
      ) {
        event.preventDefault();
        keys.add(key);
      }
    }

    function onKeyUp(event) {
      keys.delete(event.key.toLowerCase());
    }

    function animate() {
      if (keys.has("arrowup") || keys.has("w")) player.y -= 3;
      if (keys.has("arrowdown") || keys.has("s")) player.y += 3;
      if (keys.has("arrowleft") || keys.has("a")) player.x -= 3;
      if (keys.has("arrowright") || keys.has("d")) player.x += 3;

      player.x = Math.max(40, Math.min(canvas.width - 40, player.x));
      player.y = Math.max(65, Math.min(canvas.height - 65, player.y));

      // Send movement updates to the server
      if (
        socket.connected &&
        (player.x !== lastSentX || player.y !== lastSentY)
      ) {
        socket.emit("moveAvatar", {
          x: player.x,
          y: player.y,
        });

        lastSentX = player.x;
        lastSentY = player.y;
      }

      drawOffice();
      animationId = requestAnimationFrame(animate);
    }

    // Handle socket connection
    socket.on("connect", () => {
      setConnectionStatus("Connected");
      console.log("Connected to server:", socket.id);
    });

    socket.on("disconnect", () => {
      setConnectionStatus("Disconnected");
    });

    socket.on("connect_error", (error) => {
      console.error("Socket.IO connection error:", error.message);
      setConnectionStatus("Connection error");
    });

    // Load existing connected avatars
    socket.on("existingAvatars", (avatars) => {
      console.log("Existing avatars received:", avatars);
      if (!Array.isArray(avatars)) return;

      remotePlayers.clear();

      avatars.forEach(({ userId, x, y }) => {
        if (
          userId &&
          Number.isFinite(x) &&
          Number.isFinite(y)
        ) {
          remotePlayers.set(userId, { x, y });
        }
      });

      updateUserCount();
    });

    // Add an avatar when a new user joins
    socket.on("userJoined", ({ userId, x, y } = {}) => {
      console.log("New user joined:", userId);
      if (
        !userId ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        return;
      }

      remotePlayers.set(userId, { x, y });
      updateUserCount();
    });

    // Receive movement updates from other users
    socket.on("avatarMoved", ({ userId, x, y } = {}) => {
      if (
        !userId ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        return;
      }

      remotePlayers.set(userId, { x, y });
    });

    // Remove an avatar when a user disconnects
    socket.on("userLeft", ({ userId } = {}) => {
      if (!userId) return;

      remotePlayers.delete(userId);
      updateUserCount();
    });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>ProxiSpeak</h1>
          <p>Your virtual office, connected.</p>
        </div>

        <span className="status">
          ● {connectionStatus}
        </span>
      </header>

      <section className="office">
        <div className="office-heading">
          <div>
            <h2>Virtual Office</h2>
            <p>Explore your workspace using your keyboard.</p>
          </div>

          <span className="user-count">
            {userCount} {userCount === 1 ? "user" : "users"}
          </span>
        </div>

        <div className="canvas-wrapper">
          <canvas
            ref={canvasRef}
            width={900}
            height={600}
            aria-label="Virtual office. Use arrow keys or WASD to move."
          />
        </div>

        <p className="controls">
          <strong>Move:</strong> Arrow keys or W, A, S, D
        </p>
      </section>

      <footer>ProxiSpeak · Real-time workspace prototype</footer>
    </main>
  );
}
