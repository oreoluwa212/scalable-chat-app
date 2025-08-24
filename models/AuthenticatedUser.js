class AuthenticatedUser {
    constructor(userId, username, email, hashedPassword) {
        this.userId = userId || this.generateUserId();
        this.username = username;
        this.email = email;
        this.hashedPassword = hashedPassword;
        this.avatar = null;
        this.bio = '';
        this.status = 'offline'; // online, offline, away
        this.lastSeen = Date.now();
        this.joinedAt = Date.now();
        this.totalMessages = 0;
        this.favoriteRooms = [];
        this.isEmailVerified = false;
    }

    generateUserId() {
        return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    updateStatus(status) {
        this.status = status;
        this.lastSeen = Date.now();
    }

    incrementMessages() {
        this.totalMessages++;
    }

    addFavoriteRoom(roomId) {
        if (!this.favoriteRooms.includes(roomId)) {
            this.favoriteRooms.push(roomId);
        }
    }

    removeFavoriteRoom(roomId) {
        this.favoriteRooms = this.favoriteRooms.filter(id => id !== roomId);
    }

    updateProfile(updates) {
        const allowedUpdates = ['bio', 'avatar'];
        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                this[field] = updates[field];
            }
        });
    }

    getPublicProfile() {
        return {
            userId: this.userId,
            username: this.username,
            avatar: this.avatar,
            bio: this.bio,
            status: this.status,
            lastSeen: this.lastSeen,
            joinedAt: this.joinedAt,
            totalMessages: this.totalMessages,
            favoriteRooms: this.favoriteRooms
        };
    }

    toJSON() {
        return {
            userId: this.userId,
            username: this.username,
            email: this.email,
            avatar: this.avatar,
            bio: this.bio,
            status: this.status,
            lastSeen: this.lastSeen,
            joinedAt: this.joinedAt,
            totalMessages: this.totalMessages,
            favoriteRooms: this.favoriteRooms,
            isEmailVerified: this.isEmailVerified
        };
    }
}

module.exports = AuthenticatedUser;