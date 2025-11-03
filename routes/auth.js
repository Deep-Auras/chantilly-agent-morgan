const express = require('express');
const router = express.Router();
const joi = require('joi');
const { getAuthService } = require('../services/auth');
const { authLimiter, authenticateToken, sanitizeInput } = require('../middleware/auth');
const { logger } = require('../utils/logger');

// Validation schemas
const loginSchema = joi.object({
  username: joi.string().alphanum().min(3).max(30).required(),
  password: joi.string().min(6).required()
});

const changePasswordSchema = joi.object({
  currentPassword: joi.string().required(),
  newPassword: joi.string().min(8).required()
});

const createUserSchema = joi.object({
  username: joi.string().alphanum().min(3).max(30).required(),
  email: joi.string().email().required(),
  password: joi.string().min(8).required(),
  role: joi.string().valid('admin', 'user').default('user')
});

// Apply rate limiting and input sanitization to all auth routes
router.use(authLimiter);
router.use(sanitizeInput);

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { username, password } = value;
    const authService = getAuthService();
    const result = await authService.login(username, password);

    if (result.success) {
      logger.info('Successful login', { username });
      res.json(result);
    } else {
      logger.warn('Failed login attempt', { username, error: result.error });
      res.status(401).json(result);
    }
  } catch (error) {
    logger.error('Login error', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
});

// Change password endpoint (protected)
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { currentPassword, newPassword } = value;
    const authService = getAuthService();

    const result = await authService.changePassword(
      req.user.username,
      currentPassword,
      newPassword
    );

    if (result.success) {
      logger.info('Password changed', { username: req.user.username });
    }

    res.json(result);
  } catch (error) {
    logger.error('Password change error', { username: req.user.username, error });
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

// Create user endpoint (admin only)
router.post('/create-user', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { error, value } = createUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const authService = getAuthService();
    const result = await authService.createUser(value);

    if (result.success) {
      logger.info('User created', {
        createdBy: req.user.username,
        newUser: value.username
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('User creation error', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create user'
    });
  }
});

// Unlock user endpoint (admin only)
router.post('/unlock-user', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { username } = req.body;
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username required'
      });
    }

    const authService = getAuthService();
    const result = await authService.unlockUser(username);

    if (result.success) {
      logger.info('User unlocked', {
        unlockedBy: req.user.username,
        unlockedUser: username
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('User unlock error', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unlock user'
    });
  }
});

// Verify token endpoint
router.post('/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
    message: 'Token is valid'
  });
});

// Get current user info
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: {
      username: req.user.username,
      email: req.user.email,
      role: req.user.role
    }
  });
});

// Logout endpoint (optional - client-side token removal)
router.post('/logout', authenticateToken, (req, res) => {
  logger.info('User logged out', { username: req.user.username });
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;