const express = require("express");
const chatController = require("../controllers/chatController");
const router = express.Router();

router.get("/stats", (req, res) => {
  try {
    const stats = chatController.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/rooms", (req, res) => {
  try {
    const rooms = Array.from(chatController.rooms.keys());
    res.json({ rooms });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

module.exports = router;
