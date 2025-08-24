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
    const rooms = chatController.getAllRooms();
    res.json({ rooms });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

router.get("/rooms/:roomId", (req, res) => {
  try {
    const { roomId } = req.params;
    const room = chatController.rooms.get(roomId.toLowerCase());

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const roomData = {
      ...room.toJSON(),
      users: chatController.getRoomUsers(roomId),
      messages: chatController.getRoomMessages(roomId, 50)
    };

    res.json(roomData);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch room details" });
  }
});

router.post("/rooms", (req, res) => {
  try {
    const { roomId, roomName, isPrivate = false } = req.body;

    if (!roomId || typeof roomId !== 'string') {
      return res.status(400).json({ error: "Room ID is required" });
    }

    const result = chatController.createRoom(roomId, roomName, isPrivate);

    if (result.success) {
      res.status(201).json(result.room);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to create room" });
  }
});

router.get("/rooms/:roomId/messages", (req, res) => {
  try {
    const { roomId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const room = chatController.rooms.get(roomId.toLowerCase());
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const messages = chatController.getRoomMessages(roomId, limit);
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch room messages" });
  }
});

module.exports = router;