const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const AuthenticatedUser = require('../models/AuthenticatedUser');

class AuthController {
    constructor() {
        this.users = new Map(); // userId -> AuthenticatedUser
        this.usersByEmail = new Map(); // email -> userId
        this.usersByUsername = new Map(); // username -> userId
        this.sessions = new Map(); // sessionId -> userId
        this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        this.saltRounds = 10;
    }

    async register(username, email, password) {
        try {
            // Validation
            if (!username || username.trim().length < 2 || username.trim().length > 20) {
                return { success: false, error: 'Username must be 2-20 characters' };
            }

            if (!email || !this.isValidEmail(email)) {
                return { success: false, error: 'Valid email is required' };
            }

            if (!password || password.length < 6) {
                return { success: false, error: 'Password must be at least 6 characters' };
            }

            const cleanUsername = username.trim();
            const cleanEmail = email.trim().toLowerCase();

            // Check for existing users
            if (this.usersByUsername.has(cleanUsername.toLowerCase())) {
                return { success: false, error: 'Username already taken' };
            }

            if (this.usersByEmail.has(cleanEmail)) {
                return { success: false, error: 'Email already registered' };
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, this.saltRounds);

            // Create user
            const user = new AuthenticatedUser(null, cleanUsername, cleanEmail, hashedPassword);

            // Store user
            this.users.set(user.userId, user);
            this.usersByEmail.set(cleanEmail, user.userId);
            this.usersByUsername.set(cleanUsername.toLowerCase(), user.userId);

            console.log(`User registered: ${cleanUsername} (${cleanEmail})`);

            return {
                success: true,
                user: user.getPublicProfile(),
                userId: user.userId
            };

        } catch (error) {
            console.error('Registration error:', error);
            return { success: false, error: 'Registration failed' };
        }
    }

    async login(emailOrUsername, password) {
        try {
            // Find user by email or username
            let userId;
            const cleanInput = emailOrUsername.trim().toLowerCase();

            if (this.isValidEmail(cleanInput)) {
                userId = this.usersByEmail.get(cleanInput);
            } else {
                userId = this.usersByUsername.get(cleanInput);
            }

            if (!userId) {
                return { success: false, error: 'User not found' };
            }

            const user = this.users.get(userId);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            // Verify password
            const passwordMatch = await bcrypt.compare(password, user.hashedPassword);
            if (!passwordMatch) {
                return { success: false, error: 'Invalid password' };
            }

            // Update user status
            user.updateStatus('online');

            // Generate JWT token
            const token = jwt.sign(
                { userId: user.userId, username: user.username },
                this.jwtSecret,
                { expiresIn: '7d' }
            );

            console.log(`User logged in: ${user.username}`);

            return {
                success: true,
                user: user.getPublicProfile(),
                token,
                userId: user.userId
            };

        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Login failed' };
        }
    }

    logout(userId) {
        const user = this.users.get(userId);
        if (user) {
            user.updateStatus('offline');
            console.log(`User logged out: ${user.username}`);
            return { success: true };
        }
        return { success: false, error: 'User not found' };
    }

    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.jwtSecret);
            const user = this.users.get(decoded.userId);

            if (user) {
                return {
                    success: true,
                    user: user.getPublicProfile(),
                    userId: user.userId
                };
            }

            return { success: false, error: 'User not found' };
        } catch (error) {
            return { success: false, error: 'Invalid token' };
        }
    }

    updateProfile(userId, updates) {
        const user = this.users.get(userId);
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        try {
            user.updateProfile(updates);
            console.log(`Profile updated for user: ${user.username}`);
            return {
                success: true,
                user: user.getPublicProfile()
            };
        } catch (error) {
            console.error('Profile update error:', error);
            return { success: false, error: 'Profile update failed' };
        }
    }

    getUserProfile(userId) {
        const user = this.users.get(userId);
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        return {
            success: true,
            user: user.getPublicProfile()
        };
    }

    updateUserActivity(userId, activity = 'message') {
        const user = this.users.get(userId);
        if (user) {
            user.updateStatus('online');
            if (activity === 'message') {
                user.incrementMessages();
            }
        }
    }

    getUserByUsername(username) {
        const userId = this.usersByUsername.get(username.toLowerCase());
        return userId ? this.users.get(userId) : null;
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    getStats() {
        const totalUsers = this.users.size;
        const onlineUsers = Array.from(this.users.values()).filter(user => user.status === 'online').length;

        return {
            totalUsers,
            onlineUsers,
            registrationRate: totalUsers // simplified metric
        };
    }

    // Cleanup inactive users (run periodically)
    cleanupInactiveUsers() {
        const now = Date.now();
        const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

        for (const [userId, user] of this.users) {
            if (user.status === 'online' && (now - user.lastSeen > inactiveThreshold)) {
                user.updateStatus('away');
                console.log(`User marked as away: ${user.username}`);
            }
        }
    }
}

module.exports = new AuthController();