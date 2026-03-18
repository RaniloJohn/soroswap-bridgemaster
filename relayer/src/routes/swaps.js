const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

// GET /swaps
router.get('/', async (req, res) => {
  try {
    const swaps = await prisma.swapIntent.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(swaps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /swaps/:id
router.get('/:id', async (req, res) => {
  try {
    const swap = await prisma.swapIntent.findUnique({
      where: { id: req.params.id }
    });
    if (!swap) return res.status(404).json({ error: "Not found" });
    res.json(swap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /swaps
router.post('/', async (req, res) => {
  try {
    const { hashlock, sender, receiver, token, amount, timelock } = req.body;
    const newSwap = await prisma.swapIntent.create({
      data: { hashlock, sender, receiver, token, amount: String(amount), timelock }
    });
    res.status(201).json(newSwap);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
