class Room {
    constructor(id, name, isPrivate = false) {
        this.id = id.toLowerCase();
        this.name = name;
        this.isPrivate = isPrivate;
        this.users = new Set();
        this.createdAt = Date.now();
        this.lastActivity = Date.now();
    }

    addUser(userId) {
        this.users.add(userId);
        this.updateActivity();
    }

    removeUser(userId) {
        this.users.delete(userId);
        this.updateActivity();
    }

    updateActivity() {
        this.lastActivity = Date.now();
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            isPrivate: this.isPrivate,
            userCount: this.users.size,
            createdAt: this.createdAt,
            lastActivity: this.lastActivity
        };
    }
}

module.exports = Room;