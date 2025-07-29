class Message {
  constructor(username, content, room) {
    this.id = Date.now() + Math.random();
    this.username = username;
    this.content = content;
    this.room = room;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      username: this.username,
      message: this.content,
      room: this.room,
      timestamp: this.timestamp,
    };
  }
}

module.exports = Message;
