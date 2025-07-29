const User = require("../models/User");
const Message = require("../models/Message");

class ChatController {
  constructor() {
    this.users = new Map();
    this.messages = [];
    this.rooms = new Map();
    this.connectionCount = 0;
  }

  addUser(socketId, username, room = "general") {
    const user = new User(socketId, username, room);
    this.users.set(socketId, user);
    this.connectionCount++;

    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room).add(socketId);

    console.log(`User ${username} joined room ${room}`);
    return user;
  }

  removeUser(socketId) {
    const user = this.users.get(socketId);
    if (user) {
      this.rooms.get(user.room)?.delete(socketId);
      this.users.delete(socketId);
      this.connectionCount--;

      if (this.rooms.get(user.room)?.size === 0) {
        this.rooms.delete(user.room);
      }

      console.log(`User ${user.username} disconnected`);
    }
    return user;
  }

  addMessage(username, content, room) {
    const message = new Message(username, content, room);
    this.messages.push(message);
    return message;
  }

  getRoomUsers(room) {
    if (!this.rooms.has(room)) return [];

    return Array.from(this.rooms.get(room))
      .map((id) => this.users.get(id))
      .filter((user) => user)
      .map((user) => user.username);
  }

  getStats() {
    return {
      activeConnections: this.connectionCount,
      totalMessages: this.messages.length,
      activeRooms: this.rooms.size,
      uptime: process.uptime(),
    };
  }
}

module.exports = new ChatController();
