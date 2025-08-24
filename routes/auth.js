const express = require('express');
const authController = require('../controllers/authController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username, email, and password are required'
            });
        }

        const result = await authController.register(username, email, password);

        if (result.success) {
            res.status(201).json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Registration route error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { emailOrUsername, password } = req.body;

        if (!emailOrUsername || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email/username and password are required'
            });
        }

        const result = await authController.login(emailOrUsername, password);

        if (result.success) {
            res.json(result);
        } else {
            res.status(401).json(result);
        }
    } catch (error) {
        console.error('Login route error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Logout user
router.post('/logout', authenticateToken, (req, res) => {
    try {
        const result = authController.logout(req.userId);
        res.json(result);
    } catch (error) {
        console.error('Logout route error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get current user profile
router.get('/profile', authenticateToken, (req, res) => {
    try {
        const result = authController.getUserProfile(req.userId);

        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        console.error('Profile route error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update user profile
router.put('/profile', authenticateToken, (req, res) => {
    try {
        const { bio, avatar } = req.body;
        const updates = {};

        if (bio !== undefined) updates.bio = bio;
        if (avatar !== undefined) updates.avatar = avatar;

        const result = authController.updateProfile(req.userId, updates);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Profile update route error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Verify token (for frontend auth checks)
router.get('/verify', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: req.user,
        userId: req.userId
    });
});

// Get public profile by username
router.get('/user/:username', optionalAuth, (req, res) => {
    try {
        const { username } = req.params;
        const user = authController.getUserByUsername(username);

        if (user) {
            res.json({
                success: true,
                user: user.getPublicProfile()
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
    } catch (error) {
        console.error('Get user route error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;