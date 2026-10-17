
import { useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import "./App.css";

const WIDTH = 900;
const HEIGHT = 600;
const SPEED = 3;

function clampPosition(x, y) {
  return {
    x: Math.max(40, Math.min(WIDTH - 40, x)),
    y: Math.max(65, Math.min(HEIGHT - 65, y)),
  };
}

function App() {
  const canvasRef = useRef(null);
  const playerRef = useRef({ x: 450, y: 300 });
  const otherPlayersRef = useRef({});
  const keysRef = useRef(new Set());

  const [connected, setConnected] = useState(false);
  const [playerCount, setPlayerCount] = useState(1);
  const [connectedUsers, setConnectedUsers] = useState([]);

  function syncConnectedUsers() {
    setConnectedUsers(
      Object.keys(otherPlayersRef.current).map((userId, index) => ({
        id: userId,
        name: `Guest ${index + 1}`,
      }))
    );
    setPlayerCount(Object.keys(otherPlayersRef.current).length + 1);
  }

  // Socket.IO connection and multiplayer events.
  useEffect(() => {
    function handleConnect() {
      setConnected(true);
      console.log("Connected to ProxiSpeak:", socket.id);

      socket.emit("getAvatars");
      socket.emit("moveAvatar", playerRef.current);
    }

    function handleDisconnect() {
      setConnected(false);
      otherPlayersRef.current = {};
      setConnectedUsers([]);
      setPlayerCount(1);

      console.log("Disconnected from ProxiSpeak");
    }

    function handleCurrentAvatars(avatars) {
      if (!Array.isArray(avatars)) return;

      const updatedPlayers = {};

      avatars.forEach((avatar) => {
        if (
          !avatar ||
          typeof avatar.userId !== "string" ||
          avatar.userId === socket.id ||
          !Number.isFinite(avatar.x) ||
          !Number.isFinite(avatar.y)
        ) {
          return;
        }

        updatedPlayers[avatar.userId] = clampPosition(
          avatar.x,
          avatar.y
        );
      });

      otherPlayersRef.current = updatedPlayers;
      syncConnectedUsers();

      console.log("Current avatars synchronized");
    }

    function handleAvatarMoved(data) {
      if (
        !data ||
        typeof data.userId !== "string" ||
        data.userId === socket.id ||
        !Number.isFinite(data.x) ||
        !Number.isFinite(data.y)
      ) {
        return;
      }

      otherPlayersRef.current[data.userId] = clampPosition(
        data.x,
        data.y
      );

      syncConnectedUsers();
    }

    function handleAvatarLeft(data) {
      if (!data || typeof data.userId !== "string") return;

      delete otherPlayersRef.current[data.userId];
      syncConnectedUsers();

      console.log("Avatar left:", data.userId);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("currentAvatars", handleCurrentAvatars);
    socket.on("avatarMoved", handleAvatarMoved);
    socket.on("avatarLeft", handleAvatarLeft);

    socket.connect();

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("currentAvatars", handleCurrentAvatars);
      socket.off("avatarMoved", handleAvatarMoved);
      socket.off("avatarLeft", handleAvatarLeft);
      socket.disconnect();
    };
  }, []);

  // Draw the virtual office and animate avatars.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const keys = keysRef.current;
    const player = playerRef.current;

    let animationId;
    let lastSentAt = 0;
    let lastSentX = player.x;
    let lastSentY = player.y;

    function drawDesk(x, y) {
      ctx.fillStyle = "#806247";
      ctx.fillRect(x + 8, y + 48, 9, 14);
      ctx.fillRect(x + 93, y + 48, 9, 14);

      ctx.fillStyle = "#b89570";
      ctx.fillRect(x, y, 110, 54);

      ctx.fillStyle = "#574638";
      ctx.fillRect(x + 10, y + 7, 90, 39);

      ctx.fillStyle = "#52616f";
      ctx.fillRect(x + 32, y - 22, 46, 26);

      ctx.fillStyle = "#9ed9ed";
      ctx.fillRect(x + 35, y - 19, 40, 20);
    }

    function drawPlant(x, y) {
      ctx.fillStyle = "#a66a45";
      ctx.fillRect(x - 11, y + 9, 22, 20);

      ctx.fillStyle = "#39865b";
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#65ad77";
      ctx.beginPath();
      ctx.arc(x - 8, y - 7, 9, 0, Math.PI * 2);
      ctx.arc(x + 8, y - 6, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawAvatar(x, y, name, color) {
      // Shadow.
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.beginPath();
      ctx.ellipse(x, y + 17, 17, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body.
      ctx.fillStyle = color;
      ctx.fillRect(x - 12, y - 2, 24, 25);

      // Head.
      ctx.fillStyle = "#f0bd91";
      ctx.beginPath();
      ctx.arc(x, y - 15, 13, 0, Math.PI * 2);
      ctx.fill();

      // Hair.
      ctx.fillStyle = "#44332d";
      ctx.beginPath();
      ctx.arc(x, y - 19, 12, Math.PI, Math.PI * 2);
      ctx.fill();

      // Eyes.
      ctx.fillStyle = "#30251f";
      ctx.beginPath();
      ctx.arc(x - 4, y - 15, 1.3, 0, Math.PI * 2);
      ctx.arc(x + 4, y - 15, 1.3, 0, Math.PI * 2);
      ctx.fill();

      // Name label.
      ctx.font = "bold 13px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#eee8dc";
      ctx.strokeText(name, x, y + 40);

      ctx.fillStyle = "#172033";
      ctx.fillText(name, x, y + 40);
    }

    function drawOffice() {
      // Floor.
      ctx.fillStyle = "#eee8dc";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Floor grid.
      ctx.strokeStyle = "#ddd4c5";
      ctx.lineWidth = 1;

      for (let x = 0; x <= WIDTH; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
      }

      for (let y = 0; y <= HEIGHT; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }

      // Walls.
      ctx.fillStyle = "#64748b";
      ctx.fillRect(0, 0, WIDTH, 16);
      ctx.fillRect(0, 0, 16, HEIGHT);
      ctx.fillRect(WIDTH - 16, 0, 16, HEIGHT);
      ctx.fillRect(0, HEIGHT - 16, WIDTH, 16);

      // Furniture.
      drawDesk(80, 110);
      drawDesk(280, 110);
      drawDesk(680, 110);
      drawDesk(80, 420);
      drawDesk(680, 420);

      // Plants.
      drawPlant(55, 65);
      drawPlant(835, 65);
      drawPlant(835, 515);

      // Office title.
      ctx.fillStyle = "#475569";
      ctx.font = "bold 16px Arial";
      ctx.textAlign = "left";
      ctx.fillText("PROXISPEAK OFFICE", 35, 45);

      // Remote avatars.
      Object.entries(otherPlayersRef.current).forEach(
        ([, position], index) => {
          drawAvatar(
            position.x,
            position.y,
            `Guest ${index + 1}`,
            "#df7b48"
          );
        }
      );

      // Local avatar.
      drawAvatar(player.x, player.y, "You", "#4169e1");
    }

    function handleKeyDown(event) {
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

    function handleKeyUp(event) {
      keys.delete(event.key.toLowerCase());
    }

    function handleBlur() {
      keys.clear();
    }

    function animate(timestamp) {
      let dx = 0;
      let dy = 0;

      if (keys.has("arrowup") || keys.has("w")) dy -= 1;
      if (keys.has("arrowdown") || keys.has("s")) dy += 1;
      if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
      if (keys.has("arrowright") || keys.has("d")) dx += 1;

      // Normalize diagonal movement.
      if (dx !== 0 || dy !== 0) {
        const magnitude = Math.hypot(dx, dy);
        player.x += (dx / magnitude) * SPEED;
        player.y += (dy / magnitude) * SPEED;
      }

      // Keep avatar inside the office.
      player.x = Math.max(40, Math.min(WIDTH - 40, player.x));
      player.y = Math.max(65, Math.min(HEIGHT - 65, player.y));

      // Send changed positions at most 20 times per second.
      if (
        socket.connected &&
        (player.x !== lastSentX || player.y !== lastSentY) &&
        timestamp - lastSentAt >= 50
      ) {
        socket.emit("moveAvatar", {
          x: player.x,
          y: player.y,
        });

        lastSentX = player.x;
        lastSentY = player.y;
        lastSentAt = timestamp;
      }

      drawOffice();
      animationId = requestAnimationFrame(animate);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      keys.clear();
    };
  }, []);

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>ProxiSpeak</h1>
          <p>Your virtual office, connected.</p>
        </div>

        <span
          className="status"
          style={{
            background: connected ? "#e8f7ed" : "#fff1f0",
            color: connected ? "#247343" : "#b42318",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              marginRight: 7,
              background: connected ? "#2e9d59" : "#d92d20",
            }}
          />
          {connected ? "Connected" : "Connecting..."}
        </span>
      </header>

      <section className="office">
        <div className="office-heading">
          <div>
            <h2>Virtual Office</h2>
            <p>Explore your workspace using your keyboard.</p>
          </div>

          <span className="user-count">
            {playerCount} {playerCount === 1 ? "user" : "users"}
          </span>
        </div>

        <div className="canvas-wrapper">
          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            aria-label="ProxiSpeak virtual office. Use arrow keys or WASD to move."
          />
        </div>

        <p className="controls">
          <strong>Move:</strong> Arrow keys or W, A, S, D
        </p>
      </section>

      <section className="connected-users">
        <div className="connected-users-heading">
          <h2>Connected Users</h2>
          <span>{playerCount} online</span>
        </div>

        <div className="connected-user-list">
          <div className="connected-user">
            <span className="user-avatar local-avatar">Y</span>
            <div className="user-details">
              <strong>You</strong>
              <span className="online-status">
                <span className="online-dot" />
                {connected ? "Online" : "Connecting..."}
              </span>
            </div>
          </div>

          {connectedUsers.map((user) => (
            <div className="connected-user" key={user.id}>
              <span className="user-avatar guest-avatar">
                {user.name.charAt(0)}
              </span>
              <div className="user-details">
                <strong>{user.name}</strong>
                <span className="online-status">
                  <span className="online-dot" />
                  Online
                </span>
              </div>
            </div>
          ))}

          {connectedUsers.length === 0 && (
            <p className="no-other-users">
              No other users connected yet. Invite someone to join!
            </p>
          )}
        </div>
      </section>

      <footer>ProxiSpeak · Real-time workspace prototype</footer>
    </main>
  );
}

export default App;
