// Room persistence: office layouts and furniture obstacles (which block sound).
// Uses MongoDB when connected, otherwise keeps rooms in memory.

const WORLD_WIDTH = 900;
const WORLD_HEIGHT = 600;
const MAX_OBSTACLES = 200;
const DEFAULT_ROOM_ID = "main";
const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/;

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Returns { value: { name, obstacles } } or { error: "message" }.
function validateRoomPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { error: "Invalid room data." };
  }

  if (!Array.isArray(payload.obstacles)) {
    return { error: "obstacles must be an array." };
  }

  if (payload.obstacles.length > MAX_OBSTACLES) {
    return { error: `A room can have at most ${MAX_OBSTACLES} obstacles.` };
  }

  const obstacles = [];

  for (const item of payload.obstacles) {
    if (
      !item ||
      !isNumber(item.x) ||
      !isNumber(item.y) ||
      !isNumber(item.width) ||
      !isNumber(item.height)
    ) {
      return { error: "Each obstacle needs numeric x, y, width and height." };
    }

    if (
      item.width <= 0 ||
      item.height <= 0 ||
      item.x < 0 ||
      item.y < 0 ||
      item.x + item.width > WORLD_WIDTH ||
      item.y + item.height > WORLD_HEIGHT
    ) {
      return { error: "An obstacle is outside the office area." };
    }

    obstacles.push({
      type: typeof item.type === "string" ? item.type.slice(0, 30) : "furniture",
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      blocksSound: item.blocksSound !== false,
    });
  }

  const name =
    typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim().slice(0, 60)
      : "Office";

  return { value: { name, obstacles } };
}

function toPublic(record) {
  return {
    roomId: record.roomId,
    name: record.name,
    obstacles: (record.obstacles || []).map((o) => ({
      type: o.type,
      x: o.x,
      y: o.y,
      width: o.width,
      height: o.height,
      blocksSound: o.blocksSound,
    })),
    updatedAt: record.updatedAt,
  };
}

// getModel() returns the Mongoose Room model when MongoDB is ready, else null.
function createRoomStore(getModel = () => null) {
  const memory = new Map();

  async function load(roomId) {
    const Room = getModel();

    if (Room) {
      try {
        const doc = await Room.findOne({ roomId }).lean();
        if (doc) return toPublic(doc);
      } catch (error) {
        console.error("Failed to load room from MongoDB:", error.message);
      }
    }

    const cached = memory.get(roomId);
    if (cached) return toPublic(cached);

    return { roomId, name: "Office", obstacles: [], updatedAt: null };
  }

  async function save(roomId, data) {
    const record = {
      roomId,
      name: data.name,
      obstacles: data.obstacles,
      updatedAt: new Date(),
    };

    memory.set(roomId, record);

    const Room = getModel();
    if (Room) {
      try {
        await Room.findOneAndUpdate(
          { roomId },
          {
            $set: {
              name: record.name,
              obstacles: record.obstacles,
              updatedAt: record.updatedAt,
            },
          },
          { upsert: true }
        );
      } catch (error) {
        console.error("Failed to save room to MongoDB:", error.message);
      }
    }

    return toPublic(record);
  }

  return { load, save };
}

module.exports = {
  DEFAULT_ROOM_ID,
  ROOM_ID_PATTERN,
  MAX_OBSTACLES,
  validateRoomPayload,
  createRoomStore,
};