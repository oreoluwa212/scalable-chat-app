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

    // Send available rooms to newly connected user
    socket.emit("roomsList", chatController.getAllRooms());

    socket.on("join", (data) => {
      const { username, room = "general" } = data;
      
      // Validate input
      if (!username || username.trim().length < 2 || username.trim().length > 20) {
        socket.emit('error', { message: 'Username must be 2-20 characters' });
        return;
      }

      const cleanUsername = username.trim();
      const cleanRoom = room.trim().toLowerCase();

      // Check for duplicate usernames in room
      const roomUsers = chatController.getRoomUsers(cleanRoom);
      if (roomUsers.some(user => user.username.toLowerCase() === cleanUsername.toLowerCase())) {
        socket.emit('error', { message: 'Username already taken in this room' });
        return;
      }

      // Create room if it doesn't exist
      if (!chatController.rooms.has(cleanRoom)) {
        chatController.createRoom(cleanRoom);
      }

      const user = chatController.addUser(socket.id, cleanUsername, cleanRoom);
      socket.join(cleanRoom);

      socket.to(cleanRoom).emit("userJoined", {
        username: cleanUsername,
        message: `${cleanUsername} joined the chat`,
        timestamp: new Date().toISOString(),
      });

      const roomUsers = chatController.getRoomUsers(cleanRoom);
      io.to(cleanRoom).emit("roomUsers", roomUsers);

      // Send room history
      const roomMessages = chatController.getRoomMessages(cleanRoom);
      socket.emit("roomHistory", roomMessages);

      socket.emit("joinConfirmed", {
        username: cleanUsername,
        room: cleanRoom,
        users: roomUsers
      });

      // Update rooms list for all users
      io.emit("roomsList", chatController.getAllRooms());
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
        user.room
      );
      io.to(user.room).emit("message", message.toJSON());
    });

    socket.on("createRoom", (data) => {
      const { roomId, roomName, isPrivate = false } = data;
      
      const result = chatController.createRoom(roomId, roomName, isPrivate);
      
      if (result.success) {
        // Broadcast new room to all users
        io.emit("roomCreated", result.room);
        io.emit("roomsList", chatController.getAllRooms());
        socket.emit("roomCreateSuccess", result.room);
      } else {
        socket.emit("roomCreateError", { message: result.error });
      }
    });

    socket.on("switchRoom", (data) => {
      const { roomId } = data;
      const user = chatController.users.get(socket.id);
      
      if (!user) {
        socket.emit('error', { message: 'User not found' });
        return;
      }

      const result = chatController.switchUserRoom(socket.id, roomId);
      
      if (result.success) {
        // Leave old room
        socket.leave(result.oldRoom);
        
        // Join new room
        socket.join(result.newRoom);
        
        // Notify old room
        socket.to(result.oldRoom).emit('userLeft', {
          username: user.username,
          message: `${user.username} left the chat`,
          timestamp: new Date().toISOString()
        });
        
        // Notify new room
        socket.to(result.newRoom).emit('userJoined', {
          username: user.username,
          message: `${user.username} joined the chat`,
          timestamp: new Date().toISOString()
        });
        
        // Update room user lists
        const oldRoomUsers = chatController.getRoomUsers(result.oldRoom);
        const newRoomUsers = chatController.getRoomUsers(result.newRoom);
        
        io.to(result.oldRoom).emit('roomUsers', oldRoomUsers);
        io.to(result.newRoom).emit('roomUsers', newRoomUsers);
        
        // Send room history to user
        const roomMessages = chatController.getRoomMessages(result.newRoom);
        socket.emit("roomHistory", roomMessages);
        
        // Confirm room switch to user
        socket.emit('roomSwitched', {
          oldRoom: result.oldRoom,
          newRoom: result.newRoom,
          users: newRoomUsers
        });
        
        // Update rooms list for all users
        io.emit("roomsList", chatController.getAllRooms());
        
      } else {
        socket.emit('switchRoomError', { message: result.error });
      }
    });

    socket.on("getRooms", () => {
      socket.emit("roomsList", chatController.getAllRooms());
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
        
        // Update rooms list for all users
        io.emit("roomsList", chatController.getAllRooms());
      }
    });
  });

  return io;
}

module.exports = configureSocket;