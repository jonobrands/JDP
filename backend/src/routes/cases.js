const express = require('express');
const { body, param, query } = require('express-validator');
const { validationResult } = require('express-validator');
const prisma = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { errorHandler } = require('../middleware/error');

const router = express.Router();

// @route   GET /api/cases
// @desc    Get all cases with filtering and pagination
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const where = {};
    
    if (status) {
      where.status = status;
    }
    
    if (search) {
      where.OR = [
        { caseNumber: { contains: search, mode: 'insensitive' } },
        { clientName: { contains: search, mode: 'insensitive' } },
        { caregiver: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          logs: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              action: true,
              createdAt: true,
              user: {
                select: { name: true, email: true }
              }
            }
          }
        }
      }),
      prisma.case.count({ where })
    ]);
    
    res.json({
      data: cases,
      pagination: {
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit),
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    console.error(err);
    errorHandler(err, req, res);
  }
});

// @route   GET /api/cases/:id
// @desc    Get case by ID
// @access  Private
router.get('/:id', [
  auth,
  param('id').isUUID()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: {
        logs: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { name: true, email: true }
            }
          }
        }
      }
    });

    if (!caseRecord) {
      return res.status(404).json({ msg: 'Case not found' });
    }

    res.json(caseRecord);
  } catch (err) {
    console.error(err);
    errorHandler(err, req, res);
  }
});

// @route   POST /api/cases
// @desc    Create a new case
// @access  Private
router.post('/', [
  auth,
  [
    body('caseNumber', 'Case number is required').not().isEmpty(),
    body('clientName', 'Client name is required').not().isEmpty(),
    body('caregiver', 'Caregiver name is required').not().isEmpty(),
    body('date', 'Valid date is required').isISO8601(),
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { caseNumber, clientName, caregiver, date, status = 'active', metadata } = req.body;
    
    // Check if case number already exists
    const existingCase = await prisma.case.findUnique({
      where: { caseNumber }
    });
    
    if (existingCase) {
      return res.status(400).json({ errors: [{ msg: 'Case with this number already exists' }] });
    }

    const newCase = await prisma.$transaction(async (tx) => {
      const createdCase = await tx.case.create({
        data: {
          caseNumber,
          clientName,
          caregiver,
          date: new Date(date),
          status,
          metadata,
        },
      });

      // Log the creation
      await tx.log.create({
        data: {
          action: 'create',
          entity: 'case',
          entityId: createdCase.id,
          userId: req.user.id,
          data: {
            caseNumber,
            clientName,
            caregiver,
            date,
            status,
          },
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });

      return createdCase;
    });

    res.status(201).json(newCase);
  } catch (err) {
    console.error(err);
    errorHandler(err, req, res);
  }
});

// @route   PUT /api/cases/:id
// @desc    Update a case
// @access  Private
router.put('/:id', [
  auth,
  param('id').isUUID(),
  [
    body('caseNumber', 'Case number is required').optional().not().isEmpty(),
    body('clientName', 'Client name is required').optional().not().isEmpty(),
    body('caregiver', 'Caregiver name is required').optional().not().isEmpty(),
    body('date', 'Valid date is required').optional().isISO8601(),
    body('status', 'Invalid status').optional().isIn(['active', 'completed', 'cancelled']),
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    if (updateData.date) {
      updateData.date = new Date(updateData.date);
    }

    const updatedCase = await prisma.$transaction(async (tx) => {
      // Get the current case for logging
      const currentCase = await tx.case.findUnique({
        where: { id }
      });

      if (!currentCase) {
        throw { status: 404, message: 'Case not found' };
      }

      // Update the case
      const updated = await tx.case.update({
        where: { id },
        data: updateData,
      });

      // Log the update
      await tx.log.create({
        data: {
          action: 'update',
          entity: 'case',
          entityId: id,
          userId: req.user.id,
          data: {
            previous: currentCase,
            updated: updateData,
          },
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });

      return updated;
    });

    res.json(updatedCase);
  } catch (err) {
    console.error(err);
    errorHandler(err, req, res);
  }
});

// @route   DELETE /api/cases/:id
// @desc    Delete a case
// @access  Private (Admin only)
router.delete('/:id', [
  auth,
  adminOnly,
  param('id').isUUID()
], async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.$transaction(async (tx) => {
      // Get the case before deletion for logging
      const caseToDelete = await tx.case.findUnique({
        where: { id }
      });

      if (!caseToDelete) {
        throw { status: 404, message: 'Case not found' };
      }

      // Delete the case
      await tx.case.delete({
        where: { id }
      });

      // Log the deletion
      await tx.log.create({
        data: {
          action: 'delete',
          entity: 'case',
          entityId: id,
          userId: req.user.id,
          data: {
            caseNumber: caseToDelete.caseNumber,
            clientName: caseToDelete.clientName,
            caregiver: caseToDelete.caregiver,
          },
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });
    });

    res.json({ msg: 'Case removed' });
  } catch (err) {
    console.error(err);
    errorHandler(err, req, res);
  }
});

module.exports = router;
