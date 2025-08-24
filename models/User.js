class User {
  constructor(id, username, room, userId = null) {
    this.id = id; // socket id
    this.userId = userId; // persistent user id
    this.username = username;
    this.room = room;
    this.joinTime = Date.now();
    this.isActive = true;
    this.isAuthenticated = userId !== null;
  }

  updateRoom(newRoom) {
    this.room = newRoom;
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      username: this.username,
      room: this.room,
      joinTime: this.joinTime,
      isActive: this.isActive,
      isAuthenticated: this.isAuthenticated
    };
  }
}

module.exports = User;