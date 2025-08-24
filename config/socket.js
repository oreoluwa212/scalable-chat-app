const socketIo = require("socket.io");
const chatController = require("../controllers/chatController");
const authController = require("../controllers/authController");
const { socketAuth } = require("../middleware/auth");
const logger = require("../utils/logger");

function configureSocket(server) {
  const io = socketIo(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Apply authentication middleware
  io.use(socketAuth);

  io.on("connection", (socket) => {
    logger.info(`New connection: ${socket.id} ${socket.isAuthenticated ? '(authenticated)' : '(guest)'}`);

    socket.on("join", (data) => {
      const { username, room = "general" } = data;
      let finalUsername = username;
      let userId = null;

      // If user is authenticated, use their profile username
      if (socket.isAuthenticated && socket.user) {
        finalUsername = socket.user.username;
        userId = socket.userId;

        // Update user status to online
        const authUser = authController.users.get(userId);
        if (authUser) {
          authUser.updateStatus('online');
        }
      } else {
        // For guest users, validate username
        if (!username || username.trim().length < 2 || username.trim().length > 20) {
          socket.emit('error', { message: 'Username must be 2-20 characters' });
          return;
        }
        finalUsername = username.trim();
      }

      const cleanRoom = room.trim().toLowerCase();

      // Check for duplicate usernames in room (only for guest users)
      if (!socket.isAuthenticated && !chatController.isUsernameAvailable(finalUsername, cleanRoom)) {
        socket.emit('error', { message: 'Username already taken in this room' });
        return;
      }

      const user = chatController.addUser(socket.id, finalUsername, cleanRoom, userId);
      socket.join(cleanRoom);

      socket.to(cleanRoom).emit("userJoined", {
        username: finalUsername,
        message: `${finalUsername} joined the chat`,
        timestamp: new Date().toISOString(),
        isAuthenticated: socket.isAuthenticated
      });

      const roomUsers = chatController.getRoomUsers(cleanRoom);
      io.to(cleanRoom).emit("roomUsers", roomUsers);

      socket.emit("joinConfirmed", {
        username: finalUsername,
        room: cleanRoom,
        users: roomUsers,
        isAuthenticated: socket.isAuthenticated,
        userProfile: socket.isAuthenticated ? socket.user : null
      });

      console.log(`${finalUsername} joined room: ${cleanRoom} ${socket.isAuthenticated ? '(auth)' : '(guest)'}`);
    });

    socket.on("message", (data) => {
      const user = chatController.users.get(socket.id);
      if (!user) return;

      // Validate message
      if (!data.message || data.message.trim().length === 0) return;
      if (data.message.trim().length > 500) {
        socket.emit('error', { message: 'Message too long (max 500 characters)' });
        return;
      }

      const message = chatController.addMessage(
        user.username,
        data.message.trim(),
        user.room,
        user.userId
      );

      // Add user profile info to message for authenticated users
      const messageData = message.toJSON();
      if (user.userId) {
        const authUser = authController.users.get(user.userId);
        if (authUser) {
          messageData.avatar = authUser.avatar;
          messageData.userStatus = authUser.status;
        }
      }

      io.to(user.room).emit("message", messageData);
    });

    socket.on("updateProfile", async (data) => {
      if (!socket.isAuthenticated) {
        socket.emit('error', { message: 'Authentication required' });
        return;
      }

      const result = authController.updateProfile(socket.userId, data);

      if (result.success) {
        socket.user = result.user;
        socket.emit("profileUpdated", result.user);

        // Notify all rooms where this user is present
        const userSockets = chatController.getAuthenticatedUserSockets(socket.userId);
        userSockets.forEach(socketId => {
          const userInRoom = chatController.users.get(socketId);
          if (userInRoom) {
            socket.to(userInRoom.room).emit("userProfileUpdated", {
              username: result.user.username,
              profile: result.user
            });
          }
        });
      } else {
        socket.emit('profileUpdateError', { message: result.error });
      }
    });

    socket.on("getProfile", (data) => {
      const { username } = data;

      if (socket.isAuthenticated && socket.user.username === username) {
        // Send own profile
        socket.emit("profileData", socket.user);
      } else {
        // Send public profile
        const user = authController.getUserByUsername(username);
        if (user) {
          socket.emit("profileData", user.getPublicProfile());
        } else {
          socket.emit('error', { message: 'User not found' });
        }
      }
    });

    socket.on("typing", (isTyping) => {
      const user = chatController.users.get(socket.id);
      if (!user) return;

      socket.to(user.room).emit("userTyping", {
        username: user.username,
        isTyping,
        isAuthenticated: user.isAuthenticated,
        avatar: socket.isAuthenticated && socket.user ? socket.user.avatar : null
      });
    });

    socket.on("disconnect", () => {
      const user = chatController.removeUser(socket.id);
      if (user) {
        socket.to(user.room).emit("userLeft", {
          username: user.username,
          message: `${user.username} left the chat`,
          timestamp: new Date().toISOString(),
          isAuthenticated: user.isAuthenticated
        });

        const roomUsers = chatController.getRoomUsers(user.room);
        io.to(user.room).emit("roomUsers", roomUsers);

        console.log(`${user.username} disconnected ${user.isAuthenticated ? '(auth)' : '(guest)'}`);
      }
    });

    // Handle authentication status changes
    socket.on("authenticate", (data) => {
      const { token } = data;

      if (!token) {
        socket.emit('authError', { message: 'Token required' });
        return;
      }

      const result = authController.verifyToken(token);
      if (result.success) {
        socket.userId = result.userId;
        socket.user = result.user;
        socket.isAuthenticated = true;

        // Update user status
        const authUser = authController.users.get(result.userId);
        if (authUser) {
          authUser.updateStatus('online');
        }

        socket.emit('authSuccess', {
          user: result.user,
          userId: result.userId
        });

        console.log(`Socket authenticated: ${result.user.username}`);
      } else {
        socket.emit('authError', { message: result.error });
      }
    });

    socket.on("logout", () => {
      if (socket.isAuthenticated && socket.userId) {
        authController.logout(socket.userId);
        socket.userId = null;
        socket.user = null;
        socket.isAuthenticated = false;

        socket.emit('logoutSuccess');
        console.log(`Socket logged out: ${socket.id}`);
      }
    });
  });

  // Cleanup inactive users periodically
  setInterval(() => {
    authController.cleanupInactiveUsers();
  }, 5 * 60 * 1000); // Every 5 minutes

  return io;
}

module.exports = configureSocket;