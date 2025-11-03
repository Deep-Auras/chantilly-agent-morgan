const express = require('express');
const router = express.Router();
const joi = require('joi');
const { authenticateToken, sanitizeInput } = require('../middleware/auth');
const { getUserRoleService } = require('../services/userRoleService');
const { getFirestore, getFieldValue } = require('../config/firestore');
const { logger } = require('../utils/logger');

// Validation schemas
const createMappingSchema = joi.object({
  bitrixUserId: joi.string().alphanum().min(1).max(100).required(),
  internalUserId: joi.string().alphanum().min(3).max(30).required()
});

const updateRoleSchema = joi.object({
  role: joi.string().valid('admin', 'user').required()
});

// Admin-only middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    logger.warn('Non-admin user attempted admin action', {
      username: req.user?.username,
      role: req.user?.role,
      path: req.path
    });
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
};

// Apply authentication and sanitization to all admin routes
router.use(authenticateToken);
router.use(requireAdmin);
router.use(sanitizeInput);

/**
 * GET /admin/bitrix-users
 * List all Bitrix user mappings
 */
router.get('/bitrix-users', async (req, res) => {
  try {
    const userRoleService = getUserRoleService();
    const users = await userRoleService.getAllBitrixUsers();

    logger.info('Bitrix users listed', {
      requestedBy: req.user.username,
      count: users.length
    });

    res.json({
      success: true,
      users: users,
      count: users.length
    });
  } catch (error) {
    logger.error('Failed to list Bitrix users', {
      error: error.message,
      requestedBy: req.user.username
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user mappings'
    });
  }
});

/**
 * GET /admin/bitrix-users/:bitrixUserId
 * Get a specific Bitrix user mapping
 */
router.get('/bitrix-users/:bitrixUserId', async (req, res) => {
  try {
    const { bitrixUserId } = req.params;

    if (!bitrixUserId) {
      return res.status(400).json({
        success: false,
        error: 'Bitrix user ID is required'
      });
    }

    const db = getFirestore();
    const doc = await db.collection('bitrix_users').doc(bitrixUserId).get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Bitrix user mapping not found'
      });
    }

    logger.info('Bitrix user mapping retrieved', {
      requestedBy: req.user.username,
      bitrixUserId
    });

    res.json({
      success: true,
      user: {
        bitrixUserId: doc.id,
        ...doc.data()
      }
    });
  } catch (error) {
    logger.error('Failed to get Bitrix user mapping', {
      error: error.message,
      requestedBy: req.user.username,
      bitrixUserId: req.params.bitrixUserId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user mapping'
    });
  }
});

/**
 * POST /admin/bitrix-users
 * Create a new Bitrix user mapping
 */
router.post('/bitrix-users', async (req, res) => {
  try {
    const { error, value } = createMappingSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { bitrixUserId, internalUserId } = value;
    const db = getFirestore();

    // Check if mapping already exists
    const existingMapping = await db.collection('bitrix_users').doc(bitrixUserId).get();
    if (existingMapping.exists) {
      return res.status(409).json({
        success: false,
        error: 'Bitrix user mapping already exists',
        existing: {
          bitrixUserId,
          internalUserId: existingMapping.data().internalUserId,
          role: existingMapping.data().role
        }
      });
    }

    // Verify internal user exists
    const userDoc = await db.collection('users').doc(internalUserId).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: `Internal user "${internalUserId}" not found`,
        suggestion: 'Create the user first using POST /auth/create-user'
      });
    }

    const userData = userDoc.data();

    // Validate user has required fields
    if (!userData.role || !userData.email) {
      return res.status(400).json({
        success: false,
        error: 'Internal user missing required fields (role or email)'
      });
    }

    // Create mapping
    await db.collection('bitrix_users').doc(bitrixUserId).set({
      bitrixUserId,
      internalUserId,
      email: userData.email,
      role: userData.role,
      createdAt: getFieldValue().serverTimestamp(),
      lastUpdatedAt: getFieldValue().serverTimestamp(),
      lastSeen: null,
      createdBy: req.user.username
    });

    logger.info('Bitrix user mapping created', {
      createdBy: req.user.username,
      bitrixUserId,
      internalUserId,
      role: userData.role
    });

    res.status(201).json({
      success: true,
      message: 'Bitrix user mapping created successfully',
      mapping: {
        bitrixUserId,
        internalUserId,
        email: userData.email,
        role: userData.role
      }
    });
  } catch (error) {
    logger.error('Failed to create Bitrix user mapping', {
      error: error.message,
      requestedBy: req.user.username,
      body: req.body
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create user mapping'
    });
  }
});

/**
 * PUT /admin/bitrix-users/:bitrixUserId/role
 * Update user role
 */
router.put('/bitrix-users/:bitrixUserId/role', async (req, res) => {
  try {
    const { bitrixUserId } = req.params;
    const { error, value } = updateRoleSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    if (!bitrixUserId) {
      return res.status(400).json({
        success: false,
        error: 'Bitrix user ID is required'
      });
    }

    const { role } = value;
    const userRoleService = getUserRoleService();

    // Update role using service (handles both collections and cache invalidation)
    const result = await userRoleService.updateUserRole(bitrixUserId, role);

    logger.info('User role updated via admin API', {
      updatedBy: req.user.username,
      bitrixUserId,
      oldRole: result.oldRole,
      newRole: result.newRole
    });

    res.json({
      success: true,
      message: 'User role updated successfully',
      ...result
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    logger.error('Failed to update user role', {
      error: error.message,
      requestedBy: req.user.username,
      bitrixUserId: req.params.bitrixUserId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update user role'
    });
  }
});

/**
 * DELETE /admin/bitrix-users/:bitrixUserId
 * Delete Bitrix user mapping
 * NOTE: Does NOT delete the internal user account (safety measure)
 */
router.delete('/bitrix-users/:bitrixUserId', async (req, res) => {
  try {
    const { bitrixUserId } = req.params;

    if (!bitrixUserId) {
      return res.status(400).json({
        success: false,
        error: 'Bitrix user ID is required'
      });
    }

    const db = getFirestore();

    // Check if mapping exists
    const doc = await db.collection('bitrix_users').doc(bitrixUserId).get();
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Bitrix user mapping not found'
      });
    }

    const mappingData = doc.data();

    // Delete mapping
    await db.collection('bitrix_users').doc(bitrixUserId).delete();

    // Invalidate cache
    const userRoleService = getUserRoleService();
    userRoleService.invalidateCache(bitrixUserId);

    logger.info('Bitrix user mapping deleted', {
      deletedBy: req.user.username,
      bitrixUserId,
      internalUserId: mappingData.internalUserId,
      note: 'Internal user account NOT deleted (safety measure)'
    });

    res.json({
      success: true,
      message: 'Bitrix user mapping deleted successfully',
      deleted: {
        bitrixUserId,
        internalUserId: mappingData.internalUserId
      },
      note: 'Internal user account was not deleted'
    });
  } catch (error) {
    logger.error('Failed to delete Bitrix user mapping', {
      error: error.message,
      requestedBy: req.user.username,
      bitrixUserId: req.params.bitrixUserId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete user mapping'
    });
  }
});

/**
 * GET /admin/bitrix-users/stats
 * Get Bitrix user mapping statistics
 */
router.get('/bitrix-users-stats', async (req, res) => {
  try {
    const db = getFirestore();
    const userRoleService = getUserRoleService();

    // Get all mappings
    const snapshot = await db.collection('bitrix_users').get();

    // Count by role
    let adminCount = 0;
    let userCount = 0;
    let unmappedCount = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.role === 'admin') {
        adminCount++;
      } else if (data.role === 'user') {
        userCount++;
      } else {
        unmappedCount++;
      }
    });

    // Get cache stats
    const cacheStats = userRoleService.getCacheStats();

    logger.info('Bitrix user stats retrieved', {
      requestedBy: req.user.username
    });

    res.json({
      success: true,
      stats: {
        totalMappings: snapshot.size,
        adminUsers: adminCount,
        regularUsers: userCount,
        unmappedRoles: unmappedCount,
        cache: cacheStats
      }
    });
  } catch (error) {
    logger.error('Failed to get Bitrix user stats', {
      error: error.message,
      requestedBy: req.user.username
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics'
    });
  }
});

/**
 * POST /admin/bitrix-users/cache/clear
 * Clear role cache (for debugging/testing)
 */
router.post('/bitrix-users-cache/clear', async (req, res) => {
  try {
    const userRoleService = getUserRoleService();
    const statsBefore = userRoleService.getCacheStats();

    userRoleService.clearCache();

    logger.info('Role cache cleared', {
      clearedBy: req.user.username,
      previousSize: statsBefore.cacheSize
    });

    res.json({
      success: true,
      message: 'Role cache cleared successfully',
      statsBefore,
      statsAfter: userRoleService.getCacheStats()
    });
  } catch (error) {
    logger.error('Failed to clear role cache', {
      error: error.message,
      requestedBy: req.user.username
    });
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

module.exports = router;
