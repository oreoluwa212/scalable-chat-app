// server.js - Production-Ready Scalable Real-time Chat Application
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cluster = require('cluster');
const os = require('os');

// Clustering for multi-core utilization
if (cluster.isMaster && process.env.NODE_ENV === 'production') {
    const numCPUs = os.cpus().length;
    console.log(`Master ${process.pid} is running`);
    console.log(`Forking ${numCPUs} workers...`);
    
    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    
    // Handle worker crashes
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died. Restarting...`);
        cluster.fork();
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('Master received SIGTERM, shutting down workers...');
        Object.values(cluster.workers).forEach(worker => {
            worker.kill('SIGTERM');
        });
    });
} else {
    // Worker process - runs the actual application
    startServer();
}

function startServer() {
    const app = express();
    const server = http.createServer(app);
    
    // Socket.io configuration for scalability
    const io = socketIo(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        },
        // Connection limits and optimization
        maxHttpBufferSize: 1e6, // 1MB limit
        pingTimeout: 60000,
        pingInterval: 25000,
        // Enable compression for better performance
        compression: true,
        // Optimize for high connection count
        transports: ['websocket', 'polling']
    });

    // Advanced in-memory storage with optimization
    class ScalableStorage {
        constructor() {
            this.users = new Map();
            this.messages = [];
            this.rooms = new Map();
            this.messageIndex = 0;
            this.maxMessages = 10000; // Prevent memory bloat
            this.userActivity = new Map();
        }
        
        addUser(socketId, userData) {
            this.users.set(socketId, {
                ...userData,
                joinTime: Date.now(),
                lastActivity: Date.now()
            });
            this.updateActivity(socketId);
        }
        
        removeUser(socketId) {
            const user = this.users.get(socketId);
            if (user) {
                this.removeFromRoom(socketId, user.room);
                this.users.delete(socketId);
                this.userActivity.delete(socketId);
            }
            return user;
        }
        
        addToRoom(socketId, roomId) {
            if (!this.rooms.has(roomId)) {
                this.rooms.set(roomId, new Set());
            }
            this.rooms.get(roomId).add(socketId);
        }
        
        removeFromRoom(socketId, roomId) {
            const room = this.rooms.get(roomId);
            if (room) {
                room.delete(socketId);
                if (room.size === 0) {
                    this.rooms.delete(roomId);
                }
            }
        }
        
        addMessage(messageData) {
            this.messageIndex++;
            const message = {
                ...messageData,
                id: this.messageIndex
            };
            
            this.messages.push(message);
            
            // Implement circular buffer to prevent memory bloat
            if (this.messages.length > this.maxMessages) {
                this.messages.shift();
            }
            
            return message;
        }
        
        updateActivity(socketId) {
            this.userActivity.set(socketId, Date.now());
        }
        
        cleanupInactiveUsers() {
            const now = Date.now();
            const timeout = 30 * 60 * 1000; // 30 minutes
            
            for (const [socketId, lastActivity] of this.userActivity) {
                if (now - lastActivity > timeout) {
                    console.log(`Cleaning up inactive user: ${socketId}`);
                    this.removeUser(socketId);
                }
            }
        }
        
        getRoomUsers(roomId) {
            const room = this.rooms.get(roomId);
            if (!room) return [];
            
            return Array.from(room)
                .map(id => this.users.get(id))
                .filter(Boolean)
                .map(user => ({
                    username: user.username,
                    joinTime: user.joinTime
                }));
        }
        
        getStats() {
            return {
                totalUsers: this.users.size,
                totalRooms: this.rooms.size,
                totalMessages: this.messages.length,
                memoryUsage: process.memoryUsage()
            };
        }
    }

    // Performance monitoring
    class PerformanceMonitor {
        constructor() {
            this.startTime = Date.now();
            this.connectionCount = 0;
            this.messageCount = 0;
            this.peakConnections = 0;
            this.requestCount = 0;
            this.errorCount = 0;
        }
        
        recordConnection(isConnect = true) {
            if (isConnect) {
                this.connectionCount++;
                if (this.connectionCount > this.peakConnections) {
                    this.peakConnections = this.connectionCount;
                }
            } else {
                this.connectionCount--;
            }
        }
        
        recordMessage() {
            this.messageCount++;
        }
        
        recordRequest() {
            this.requestCount++;
        }
        
        recordError() {
            this.errorCount++;
        }
        
        getMetrics() {
            const uptime = Date.now() - this.startTime;
            const uptimeSeconds = uptime / 1000;
            
            return {
                uptime: uptime,
                uptimeHuman: this.formatUptime(uptime),
                activeConnections: this.connectionCount,
                peakConnections: this.peakConnections,
                totalMessages: this.messageCount,
                messagesPerSecond: (this.messageCount / uptimeSeconds).toFixed(2),
                requestsPerSecond: (this.requestCount / uptimeSeconds).toFixed(2),
                errorRate: ((this.errorCount / this.requestCount) * 100).toFixed(2),
                memoryUsage: this.getMemoryUsage(),
                cpuUsage: process.cpuUsage()
            };
        }
        
        formatUptime(ms) {
            const seconds = Math.floor(ms / 1000) % 60;
            const minutes = Math.floor(ms / (1000 * 60)) % 60;
            const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
            const days = Math.floor(ms / (1000 * 60 * 60 * 24));
            
            return `${days}d ${hours}h ${minutes}m ${seconds}s`;
        }
        
        getMemoryUsage() {
            const memory = process.memoryUsage();
            return {
                rss: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`,
                heapTotal: `${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
                heapUsed: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                external: `${(memory.external / 1024 / 1024).toFixed(2)} MB`
            };
        }
    }

    // Initialize storage and monitoring
    const storage = new ScalableStorage();
    const monitor = new PerformanceMonitor();

    // Middleware with performance tracking
    app.use((req, res, next) => {
        monitor.recordRequest();
        const start = Date.now();
        
        res.on('finish', () => {
            const duration = Date.now() - start;
            if (duration > 1000) { // Log slow requests
                console.log(`Slow request: ${req.method} ${req.url} - ${duration}ms`);
            }
        });
        
        next();
    });

    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.json({ limit: '1mb' }));

    // Routes with enhanced error handling
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.get('/api/stats', (req, res) => {
        try {
            const stats = {
                server: monitor.getMetrics(),
                storage: storage.getStats(),
                process: {
                    pid: process.pid,
                    nodeVersion: process.version,
                    platform: process.platform
                }
            };
            res.json(stats);
        } catch (error) {
            monitor.recordError();
            res.status(500).json({ error: 'Failed to get stats' });
        }
    });

    app.get('/api/rooms', (req, res) => {
        try {
            const rooms = Array.from(storage.rooms.keys()).map(roomId => ({
                id: roomId,
                userCount: storage.rooms.get(roomId).size,
                users: storage.getRoomUsers(roomId)
            }));
            res.json(rooms);
        } catch (error) {
            monitor.recordError();
            res.status(500).json({ error: 'Failed to get rooms' });
        }
    });

    // Enhanced Socket.io connection handling
    io.on('connection', (socket) => {
        monitor.recordConnection(true);
        console.log(`User connected: ${socket.id} | Total: ${monitor.connectionCount} | Worker: ${process.pid}`);

        // Rate limiting for message sending
        const messageRateLimit = {
            count: 0,
            resetTime: Date.now() + 60000, // 1 minute window
            maxMessages: 30 // 30 messages per minute
        };

        // User joins with enhanced validation
        socket.on('join', (data) => {
            try {
                const { username, room = 'general' } = data;
                
                // Validate input
                if (!username || username.trim().length < 2 || username.trim().length > 20) {
                    socket.emit('error', { message: 'Username must be 2-20 characters' });
                    return;
                }
                
                if (!room || room.trim().length < 1 || room.trim().length > 30) {
                    socket.emit('error', { message: 'Room name must be 1-30 characters' });
                    return;
                }
                
                const cleanUsername = username.trim();
                const cleanRoom = room.trim().toLowerCase();
                
                // Check for duplicate usernames in room
                const roomUsers = storage.getRoomUsers(cleanRoom);
                if (roomUsers.some(user => user.username.toLowerCase() === cleanUsername.toLowerCase())) {
                    socket.emit('error', { message: 'Username already taken in this room' });
                    return;
                }
                
                // Add user to storage
                storage.addUser(socket.id, { username: cleanUsername, room: cleanRoom });
                storage.addToRoom(socket.id, cleanRoom);
                
                // Join socket room
                socket.join(cleanRoom);
                
                // Notify room about new user
                socket.to(cleanRoom).emit('userJoined', {
                    username: cleanUsername,
                    message: `${cleanUsername} joined the chat`,
                    timestamp: new Date().toISOString()
                });
                
                // Send updated user list
                const updatedUsers = storage.getRoomUsers(cleanRoom);
                io.to(cleanRoom).emit('roomUsers', updatedUsers);
                
                // Send join confirmation
                socket.emit('joinConfirmed', {
                    username: cleanUsername,
                    room: cleanRoom,
                    users: updatedUsers
                });
                
                console.log(`${cleanUsername} joined room: ${cleanRoom}`);
                
            } catch (error) {
                console.error('Join error:', error);
                monitor.recordError();
                socket.emit('error', { message: 'Failed to join room' });
            }
        });

        // Enhanced message handling with rate limiting
        socket.on('message', (data) => {
            try {
                // Rate limiting check
                const now = Date.now();
                if (now > messageRateLimit.resetTime) {
                    messageRateLimit.count = 0;
                    messageRateLimit.resetTime = now + 60000;
                }
                
                if (messageRateLimit.count >= messageRateLimit.maxMessages) {
                    socket.emit('error', { message: 'Rate limit exceeded. Please slow down.' });
                    return;
                }
                
                messageRateLimit.count++;
                
                const user = storage.users.get(socket.id);
                if (!user) {
                    socket.emit('error', { message: 'User not found. Please rejoin.' });
                    return;
                }
                
                // Validate message
                if (!data.message || data.message.trim().length === 0) {
                    return;
                }
                
                if (data.message.trim().length > 500) {
                    socket.emit('error', { message: 'Message too long (max 500 characters)' });
                    return;
                }
                
                const messageData = {
                    username: user.username,
                    message: data.message.trim(),
                    room: user.room,
                    timestamp: new Date().toISOString()
                };
                
                // Store message
                const storedMessage = storage.addMessage(messageData);
                monitor.recordMessage();
                storage.updateActivity(socket.id);
                
                // Broadcast to room
                io.to(user.room).emit('message', storedMessage);
                
                console.log(`Message from ${user.username} in ${user.room}: ${data.message.substring(0, 50)}${data.message.length > 50 ? '...' : ''}`);
                
            } catch (error) {
                console.error('Message error:', error);
                monitor.recordError();
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Typing indicators with throttling
        let typingTimeout;
        socket.on('typing', (isTyping) => {
            try {
                const user = storage.users.get(socket.id);
                if (!user) return;
                
                clearTimeout(typingTimeout);
                
                if (isTyping) {
                    storage.updateActivity(socket.id);
                    socket.to(user.room).emit('userTyping', {
                        username: user.username,
                        isTyping: true
                    });
                    
                    // Auto-stop typing after 3 seconds
                    typingTimeout = setTimeout(() => {
                        socket.to(user.room).emit('userTyping', {
                            username: user.username,
                            isTyping: false
                        });
                    }, 3000);
                } else {
                    socket.to(user.room).emit('userTyping', {
                        username: user.username,
                        isTyping: false
                    });
                }
            } catch (error) {
                console.error('Typing error:', error);
                monitor.recordError();
            }
        });

        // Room switching with validation
        socket.on('switchRoom', (newRoom) => {
            try {
                const user = storage.users.get(socket.id);
                if (!user) return;
                
                if (!newRoom || newRoom.trim().length < 1 || newRoom.trim().length > 30) {
                    socket.emit('error', { message: 'Invalid room name' });
                    return;
                }
                
                const cleanNewRoom = newRoom.trim().toLowerCase();
                const oldRoom = user.room;
                
                if (cleanNewRoom === oldRoom) return;
                
                // Check for duplicate username in new room
                const preSwitchRoomUsers = storage.getRoomUsers(cleanNewRoom);
                if (preSwitchRoomUsers.some(u => u.username.toLowerCase() === user.username.toLowerCase())) {
                    socket.emit('error', { message: 'Username already taken in that room' });
                    return;
                }
                
                // Leave old room
                socket.leave(oldRoom);
                storage.removeFromRoom(socket.id, oldRoom);
                
                // Join new room
                socket.join(cleanNewRoom);
                user.room = cleanNewRoom;
                storage.addToRoom(socket.id, cleanNewRoom);
                storage.updateActivity(socket.id);
                
                // Notify old room
                socket.to(oldRoom).emit('userLeft', {
                    username: user.username,
                    message: `${user.username} left the chat`,
                    timestamp: new Date().toISOString()
                });
                
                // Notify new room
                socket.to(cleanNewRoom).emit('userJoined', {
                    username: user.username,
                    message: `${user.username} joined the chat`,
                    timestamp: new Date().toISOString()
                });
                
                // Update room user lists
                const oldRoomUsers = storage.getRoomUsers(oldRoom);
                const newRoomUsers = storage.getRoomUsers(cleanNewRoom);
                
                io.to(oldRoom).emit('roomUsers', oldRoomUsers);
                io.to(cleanNewRoom).emit('roomUsers', newRoomUsers);
                
                // Confirm room switch to user
                socket.emit('roomSwitched', {
                    oldRoom,
                    newRoom: cleanNewRoom,
                    users: newRoomUsers
                });
                
                console.log(`${user.username} switched from ${oldRoom} to ${cleanNewRoom}`);
                
            } catch (error) {
                console.error('Room switch error:', error);
                monitor.recordError();
                socket.emit('error', { message: 'Failed to switch room' });
            }
        });

        // Get room history
        socket.on('getRoomHistory', (roomId, callback) => {
            try {
                const user = storage.users.get(socket.id);
                if (!user || user.room !== roomId) return;
                
                // Get last 50 messages for the room
                const roomMessages = storage.messages
                    .filter(msg => msg.room === roomId)
                    .slice(-50);
                
                if (typeof callback === 'function') {
                    callback(roomMessages);
                }
                
                storage.updateActivity(socket.id);
                
            } catch (error) {
                console.error('History error:', error);
                monitor.recordError();
            }
        });

        // Handle disconnection with cleanup
        socket.on('disconnect', (reason) => {
            try {
                const user = storage.removeUser(socket.id);
                monitor.recordConnection(false);
                
                if (user) {
                    // Notify room about user leaving
                    socket.to(user.room).emit('userLeft', {
                        username: user.username,
                        message: `${user.username} left the chat`,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Update room user list
                    const roomUsers = storage.getRoomUsers(user.room);
                    io.to(user.room).emit('roomUsers', roomUsers);
                    
                    console.log(`${user.username} disconnected (${reason}) | Total: ${monitor.connectionCount} | Worker: ${process.pid}`);
                } else {
                    console.log(`Unknown user disconnected: ${socket.id} | Total: ${monitor.connectionCount}`);
                }
                
            } catch (error) {
                console.error('Disconnect error:', error);
                monitor.recordError();
            }
        });

        // Error handling for socket
        socket.on('error', (error) => {
            console.error('Socket error:', error);
            monitor.recordError();
        });

        // Connection timeout handling
        socket.on('connect_timeout', () => {
            console.log(`Connection timeout for ${socket.id}`);
            monitor.recordError();
        });
    });

    // Periodic cleanup and monitoring
    setInterval(() => {
        try {
            // Clean up inactive users
            storage.cleanupInactiveUsers();
            
            // Log performance metrics
            const metrics = monitor.getMetrics();
            console.log(`[Worker ${process.pid}] Stats - Connections: ${metrics.activeConnections}, Messages: ${metrics.totalMessages}, Rooms: ${storage.rooms.size}, Memory: ${metrics.memoryUsage.heapUsed}`);
            
            // Force garbage collection if memory usage is high (Node.js with --expose-gc flag)
            if (global.gc && metrics.memoryUsage.heapUsed > '500 MB') {
                console.log('Running garbage collection...');
                global.gc();
            }
            
        } catch (error) {
            console.error('Cleanup error:', error);
            monitor.recordError();
        }
    }, 30000); // Every 30 seconds

    // Health check endpoint
    app.get('/health', (req, res) => {
        const metrics = monitor.getMetrics();
        const health = {
            status: 'healthy',
            uptime: metrics.uptime,
            connections: metrics.activeConnections,
            memory: metrics.memoryUsage,
            worker: process.pid
        };
        
        // Check if system is overloaded
        if (metrics.activeConnections > 10000 || metrics.memoryUsage.heapUsed > '1 GB') {
            health.status = 'overloaded';
            res.status(503);
        }
        
        res.json(health);
    });

    // Graceful shutdown handling
    const gracefulShutdown = () => {
        console.log(`Worker ${process.pid} received shutdown signal`);
        
        // Stop accepting new connections
        server.close(() => {
            console.log(`Worker ${process.pid} HTTP server closed`);
            
            // Close all socket connections
            io.close(() => {
                console.log(`Worker ${process.pid} Socket.IO server closed`);
                
                // Exit process
                process.exit(0);
            });
        });
        
        // Force exit after 10 seconds
        setTimeout(() => {
            console.error(`Worker ${process.pid} forced shutdown`);
            process.exit(1);
        }, 10000);
    };

    // Error handling
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        monitor.recordError();
        gracefulShutdown();
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        monitor.recordError();
    });

    // Graceful shutdown signals
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    // Start server
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Worker ${process.pid} - Scalable Chat Server running on port ${PORT}`);
        console.log(`Access the application at http://localhost:${PORT}`);
        console.log(`Health check available at http://localhost:${PORT}/health`);
    });

    // Handle server errors
    server.on('error', (error) => {
        console.error('Server error:', error);
        monitor.recordError();
        
        if (error.code === 'EADDRINUSE') {
            console.error(`Port ${PORT} is already in use`);
            process.exit(1);
        }
    });

    return server;
}
