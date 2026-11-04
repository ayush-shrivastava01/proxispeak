const mongoose = require("mongoose");

// One piece of furniture / a wall. Rectangles are in canvas pixels.
const obstacleSchema = new mongoose.Schema(
  {
    type: { type: String, default: "furniture" },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    blocksSound: { type: Boolean, default: true },
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  name: { type: String, default: "Office" },
  obstacles: { type: [obstacleSchema], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Room", roomSchema);