const User = require("../models/User");
const Message = require("../models/Message");
const Room = require("../models/Room");

class ChatController {
  constructor() {
    this.users = new Map();
    this.messages = [];
    this.rooms = new Map();
    this.connectionCount = 0;

    // Initialize default room
    this.createRoom("general", "General Discussion", false);
  }

  createRoom(roomId, roomName = null, isPrivate = false) {
    if (this.rooms.has(roomId)) {
      return { success: false, error: "Room already exists" };
    }

    // Validate room ID
    if (!roomId || roomId.trim().length < 1 || roomId.trim().length > 30) {
      return { success: false, error: "Room ID must be 1-30 characters" };
    }

    const cleanRoomId = roomId.trim().toLowerCase();
    const cleanRoomName = roomName ? roomName.trim() : roomId.trim();

    const room = new Room(cleanRoomId, cleanRoomName, isPrivate);
    this.rooms.set(cleanRoomId, room);

    console.log(`Room created: ${cleanRoomId} (${cleanRoomName})`);
    return { success: true, room: room.toJSON() };
  }

  addUser(socketId, username, room = "general") {
    const user = new User(socketId, username, room);
    this.users.set(socketId, user);
    this.connectionCount++;

    // Add user to room
    if (this.rooms.has(room)) {
      this.rooms.get(room).addUser(socketId);
    }

    console.log(`User ${username} joined room ${room}`);
    return user;
  }

  removeUser(socketId) {
    const user = this.users.get(socketId);
    if (user) {
      // Remove from room
      if (this.rooms.has(user.room)) {
        this.rooms.get(user.room).removeUser(socketId);

        // Clean up empty rooms (except general)
        if (user.room !== "general" && this.rooms.get(user.room).users.size === 0) {
          this.rooms.delete(user.room);
          console.log(`Empty room deleted: ${user.room}`);
        }
      }

      this.users.delete(socketId);
      this.connectionCount--;

      console.log(`User ${user.username} disconnected`);
    }
    return user;
  }

  switchUserRoom(socketId, newRoomId) {
    const user = this.users.get(socketId);
    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Validate new room
    if (!newRoomId || newRoomId.trim().length < 1 || newRoomId.trim().length > 30) {
      return { success: false, error: "Invalid room name" };
    }

    const cleanNewRoomId = newRoomId.trim().toLowerCase();
    const oldRoomId = user.room;

    if (cleanNewRoomId === oldRoomId) {
      return { success: false, error: "Already in this room" };
    }

    // Create room if it doesn't exist
    if (!this.rooms.has(cleanNewRoomId)) {
      const createResult = this.createRoom(cleanNewRoomId);
      if (!createResult.success) {
        return createResult;
      }
    }

    // Check for duplicate username in new room
    const newRoom = this.rooms.get(cleanNewRoomId);
    const existingUsernames = Array.from(newRoom.users)
      .map(id => this.users.get(id))
      .filter(Boolean)
      .map(u => u.username.toLowerCase());

    if (existingUsernames.includes(user.username.toLowerCase())) {
      return { success: false, error: "Username already taken in that room" };
    }

    // Remove from old room
    if (this.rooms.has(oldRoomId)) {
      this.rooms.get(oldRoomId).removeUser(socketId);

      // Clean up empty rooms (except general)
      if (oldRoomId !== "general" && this.rooms.get(oldRoomId).users.size === 0) {
        this.rooms.delete(oldRoomId);
      }
    }

    // Add to new room
    newRoom.addUser(socketId);
    user.updateRoom(cleanNewRoomId);

    console.log(`User ${user.username} switched from ${oldRoomId} to ${cleanNewRoomId}`);
    return {
      success: true,
      oldRoom: oldRoomId,
      newRoom: cleanNewRoomId,
      roomData: newRoom.toJSON()
    };
  }

  addMessage(username, content, room) {
    const message = new Message(username, content, room);
    this.messages.push(message);

    // Update room's last activity
    if (this.rooms.has(room)) {
      this.rooms.get(room).updateActivity();
    }

    return message;
  }

  getRoomUsers(roomId) {
    if (!this.rooms.has(roomId)) return [];

    const room = this.rooms.get(roomId);
    return Array.from(room.users)
      .map(id => this.users.get(id))
      .filter(Boolean)
      .map(user => ({
        username: user.username,
        joinTime: user.joinTime
      }));
  }

  getRoomMessages(roomId, limit = 50) {
    return this.messages
      .filter(msg => msg.room === roomId)
      .slice(-limit)
      .map(msg => msg.toJSON());
  }

  getAllRooms() {
    return Array.from(this.rooms.values())
      .map(room => ({
        ...room.toJSON(),
        userCount: room.users.size,
        users: this.getRoomUsers(room.id)
      }))
      .sort((a, b) => b.userCount - a.userCount);
  }

  getStats() {
    return {
      activeConnections: this.connectionCount,
      totalMessages: this.messages.length,
      activeRooms: this.rooms.size,
      uptime: process.uptime(),
      roomDetails: this.getAllRooms()
    };
  }
}

module.exports = new ChatController();