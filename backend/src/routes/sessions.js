const express = require('express');
const { param } = require('express-validator');
const { validationResult } = require('express-validator');
const prisma = require('../config/db');
const { redis } = require('../config/redis');
const { auth, adminOnly } = require('../middleware/auth');
const { errorHandler } = require('../middleware/error');

const router = express.Router();

// @route   GET /api/sessions
// @desc    Get all active sessions for the current user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { 
        userId: req.user.id,
        expiresAt: { gt: new Date() } // Only active sessions
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    res.json(sessions);
  } catch (err) {
    console.error(err);
    errorHandler(err, req, res);
  }
});

// @route   GET /api/sessions/all
// @desc    Get all active sessions (admin only)
// @access  Private (Admin)
router.get('/all', [auth, adminOnly], async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    res.json(sessions);
  } catch (err) {
    console.error(err);
    errorHandler(err, req, res);
  }
});

// @route   DELETE /api/sessions/:id
// @desc    Revoke a specific session
// @access  Private
router.delete('/:id', [
  auth,
  param('id').isUUID()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { id } = req.params;

    // Check if the session exists and belongs to the user (or user is admin)
    const session = await prisma.session.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!session) {
      return res.status(404).json({ msg: 'Session not found' });
    }

    // Only allow users to revoke their own sessions unless they're admin
    if (session.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Not authorized to revoke this session' });
    }

    // Delete session from database
    await prisma.session.delete({
      where: { id },
    });

    // Also remove from Redis if it exists there
    await redis.del(`session:${id}`);

    res.json({ msg: 'Session revoked' });
  } catch (err) {
    console.error(err);
    errorHandler(err, req, res);
  }
});

// @route   DELETE /api/sessions/me/all
// @desc    Revoke all sessions for the current user except the current one
// @access  Private
router.delete('/me/all', auth, async (req, res) => {
  try {
    // Get the current session ID from the token
    const token = req.header('Authorization').replace('Bearer ', '');
    
    // Find the current session
    const currentSession = await prisma.session.findFirst({
      where: { token },
      select: { id: true },
    });

    if (!currentSession) {
      return res.status(400).json({ msg: 'Current session not found' });
    }

    // Delete all other sessions for this user
    await prisma.session.deleteMany({
      where: {
        userId: req.user.id,
        id: { not: currentSession.id },
      },
    });

    // Get all session keys from Redis (this is a simplified example)
    // In a production environment, you'd want to use SCAN for large datasets
    const keys = await redis.keys('session:*');
    
    // Delete all sessions from Redis except the current one
    for (const key of keys) {
      const session = await redis.get(key);
      if (session) {
        const sessionData = JSON.parse(session);
        if (sessionData.userId === req.user.id && key !== `session:${currentSession.id}`) {
          await redis.del(key);
        }
      }
    }

    res.json({ msg: 'All other sessions have been revoked' });
  } catch (err) {
    console.error(err);
    errorHandler(err, req, res);
  }
});

module.exports = router;
