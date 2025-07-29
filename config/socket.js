const socketIo = require("socket.io");
const chatController = require("../controllers/chatController");
const logger = require("../utils/logger");

function configureSocket(server) {
  const io = socketIo(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    logger.info(`New connection: ${socket.id}`);

    socket.on("join", (data) => {
      const { username, room = "general" } = data;
      const user = chatController.addUser(socket.id, username, room);

      socket.join(room);

      socket.to(room).emit("userJoined", {
        username,
        message: `${username} joined the chat`,
        timestamp: new Date().toISOString(),
      });

      const roomUsers = chatController.getRoomUsers(room);
      io.to(room).emit("roomUsers", roomUsers);
    });

    socket.on("message", (data) => {
      const user = chatController.users.get(socket.id);
      if (!user) return;

      const message = chatController.addMessage(
        user.username,
        data.message,
        user.room
      );
      io.to(user.room).emit("message", message.toJSON());
    });

    socket.on("typing", (isTyping) => {
      const user = chatController.users.get(socket.id);
      if (!user) return;

      socket.to(user.room).emit("userTyping", {
        username: user.username,
        isTyping,
      });
    });

    socket.on("disconnect", () => {
      const user = chatController.removeUser(socket.id);
      if (user) {
        socket.to(user.room).emit("userLeft", {
          username: user.username,
          message: `${user.username} left the chat`,
        });

        const roomUsers = chatController.getRoomUsers(user.room);
        io.to(user.room).emit("roomUsers", roomUsers);
      }
    });
  });

  return io;
}

module.exports = configureSocket;
