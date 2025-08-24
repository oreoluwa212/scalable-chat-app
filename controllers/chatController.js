const User = require("../models/User");
const Message = require("../models/Message");
const authController = require('./authController');

class ChatController {
  constructor() {
    this.users = new Map();
    this.messages = [];
    this.rooms = new Map();
    this.connectionCount = 0;
  }

  addUser(socketId, username, room = "general", userId = null) {
    const user = new User(socketId, username, room, userId);
    this.users.set(socketId, user);
    this.connectionCount++;

    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room).add(socketId);

    // Update authenticated user activity if applicable
    if (userId) {
      authController.updateUserActivity(userId, 'join');
    }

    console.log(`User ${username} joined room ${room} ${userId ? '(authenticated)' : '(guest)'}`);
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

      // Update authenticated user status if applicable
      if (user.userId) {
        const authUser = authController.users.get(user.userId);
        if (authUser) {
          // Check if user has other active connections
          const hasOtherConnections = Array.from(this.users.values())
            .some(u => u.userId === user.userId && u.id !== socketId);

          if (!hasOtherConnections) {
            authUser.updateStatus('offline');
          }
        }
      }

      console.log(`User ${user.username} disconnected`);
    }
    return user;
  }

  addMessage(username, content, room, userId = null) {
    const message = new Message(username, content, room, userId);
    this.messages.push(message);

    // Update authenticated user activity if applicable
    if (userId) {
      authController.updateUserActivity(userId, 'message');
    }

    return message;
  }

  getRoomUsers(room) {
    if (!this.rooms.has(room)) return [];

    return Array.from(this.rooms.get(room))
      .map((id) => this.users.get(id))
      .filter((user) => user)
      .map((user) => {
        const baseInfo = {
          username: user.username,
          joinTime: user.joinTime,
          isAuthenticated: user.isAuthenticated
        };

        // Add profile info for authenticated users
        if (user.userId) {
          const authUser = authController.users.get(user.userId);
          if (authUser) {
            baseInfo.avatar = authUser.avatar;
            baseInfo.status = authUser.status;
            baseInfo.totalMessages = authUser.totalMessages;
          }
        }

        return baseInfo;
      });
  }

  isUsernameAvailable(username, room, excludeSocketId = null) {
    if (!this.rooms.has(room)) return true;

    return !Array.from(this.rooms.get(room))
      .filter(socketId => socketId !== excludeSocketId)
      .map(socketId => this.users.get(socketId))
      .filter(Boolean)
      .some(user => user.username.toLowerCase() === username.toLowerCase());
  }

  getUserBySocketId(socketId) {
    return this.users.get(socketId);
  }

  getAuthenticatedUserSockets(userId) {
    return Array.from(this.users.values())
      .filter(user => user.userId === userId)
      .map(user => user.id);
  }

  getStats() {
    const authStats = authController.getStats();

    return {
      activeConnections: this.connectionCount,
      totalMessages: this.messages.length,
      activeRooms: this.rooms.size,
      uptime: process.uptime(),
      authenticatedUsers: authStats.totalUsers,
      onlineAuthenticatedUsers: authStats.onlineUsers,
      guestUsers: this.connectionCount - Array.from(this.users.values()).filter(u => u.userId).length
    };
  }
}

module.exports = new ChatController();