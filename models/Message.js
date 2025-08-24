class Message {
  constructor(username, content, room, userId = null) {
    this.id = Date.now() + Math.random();
    this.username = username;
    this.content = content;
    this.room = room;
    this.userId = userId; // null for guest users
    this.timestamp = new Date().toISOString();
    this.isAuthenticated = userId !== null;
  }

  toJSON() {
    return {
      id: this.id,
      username: this.username,
      message: this.content,
      room: this.room,
      userId: this.userId,
      timestamp: this.timestamp,
      isAuthenticated: this.isAuthenticated
    };
  }
}

module.exports = Message;