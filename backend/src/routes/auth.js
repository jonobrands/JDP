const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const prisma = require('../config/db');
const { redis, setWithExpiry } = require('../config/redis');
const { auth } = require('../middleware/auth');
const { errorHandler } = require('../middleware/error');

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post(
  '/register',
  [
    body('email', 'Please include a valid email').isEmail(),
    body('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
    body('name', 'Name is required').not().isEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name } = req.body;

    try {
      // Check if user exists
      let user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        return res.status(400).json({ errors: [{ msg: 'User already exists' }] });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create user
      user = await prisma.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
        },
      });

      // Create JWT payload
      const payload = {
        user: {
          id: user.id,
        },
      };

      // Sign token
      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

      res.json({ token });
    } catch (err) {
      console.error(err.message);
      errorHandler(err, req, res);
    }
  }
);

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post(
  '/login',
  [
    body('email', 'Please include a valid email').isEmail(),
    body('password', 'Password is required').exists(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Check if user exists
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
      }

      // Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
      }

      // Create session
      const sessionId = uuidv4();
      const sessionData = {
        userId: user.id,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        createdAt: new Date().toISOString(),
      };

      // Store session in Redis
      await setWithExpiry(
        `session:${sessionId}`,
        sessionData,
        parseInt(process.env.SESSION_TTL) || 3600 // 1 hour default
      );

      // Create JWT with session ID
      const token = jwt.sign(
        { userId: user.id, sessionId },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Create session in database
      await prisma.session.create({
        data: {
          userId: user.id,
          token,
          userAgent: req.headers['user-agent'],
          ip: req.ip || '',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      // Return user data (without password) and token
      const { password: _, ...userWithoutPassword } = user;
      res.json({
        user: userWithoutPassword,
        token,
      });
    } catch (err) {
      console.error(err.message);
      errorHandler(err, req, res);
    }
  }
);

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error(err.message);
    errorHandler(err, req, res);
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user / clear session
// @access  Private
router.post('/logout', auth, async (req, res) => {
  try {
    // Delete session from Redis
    await redis.del(`session:${req.session.id}`);
    
    // Invalidate session in database
    await prisma.session.updateMany({
      where: { token: req.header('Authorization').replace('Bearer ', '') },
      data: { expiresAt: new Date() },
    });

    res.json({ msg: 'Logged out successfully' });
  } catch (err) {
    console.error(err.message);
    errorHandler(err, req, res);
  }
});

module.exports = router;
