const mongoose = require("mongoose");

// World size in pixels. The 2d index needs explicit bounds because its
// default range is -180..180 (meant for longitude/latitude, not pixels).
const WORLD_MIN = 0;
const WORLD_MAX = 1000;

const avatarSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  // [x, y] in canvas pixels
  location: { type: [Number], required: true },
  updatedAt: { type: Date, default: Date.now },
});

// Legacy "2d" index = flat (planar) geometry, so $near / $maxDistance are
// measured in the same units as the stored coordinates (pixels).
avatarSchema.index({ location: "2d" }, { min: WORLD_MIN, max: WORLD_MAX });

module.exports = mongoose.model("Avatar", avatarSchema);