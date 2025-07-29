class User {
  constructor(id, username, room) {
    this.id = id;
    this.username = username;
    this.room = room;
    this.joinTime = Date.now();
    this.isActive = true;
  }

  updateRoom(newRoom) {
    this.room = newRoom;
  }

  toJSON() {
    return {
      id: this.id,
      username: this.username,
      room: this.room,
      joinTime: this.joinTime,
      isActive: this.isActive,
    };
  }
}

module.exports = User;
