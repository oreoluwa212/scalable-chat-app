const authController = require('../controllers/authController');

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    const result = authController.verifyToken(token);
    if (result.success) {
        req.user = result.user;
        req.userId = result.userId;
        next();
    } else {
        return res.status(403).json({ error: result.error });
    }
};

// Optional authentication - doesn't fail if no token
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        const result = authController.verifyToken(token);
        if (result.success) {
            req.user = result.user;
            req.userId = result.userId;
        }
    }

    next();
};

// Middleware to extract user from socket handshake
const socketAuth = (socket, next) => {
    const token = socket.handshake.auth.token;

    if (token) {
        const result = authController.verifyToken(token);
        if (result.success) {
            socket.userId = result.userId;
            socket.user = result.user;
            socket.isAuthenticated = true;
        } else {
            socket.isAuthenticated = false;
        }
    } else {
        socket.isAuthenticated = false;
    }

    next();
};

module.exports = {
    authenticateToken,
    optionalAuth,
    socketAuth
};