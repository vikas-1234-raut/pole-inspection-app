// routes/auth.js
//
// Deliberately minimal: username/password -> JWT with { userId, role }
// embedded. No self-registration endpoint — user accounts (field workers,
// reviewers, admins) are provisioned by an admin via seed/CLI, not
// created by anyone opening the app. That's intentional for a workforce
// app like this (see decisions.md D10) — you want to know exactly which
// real person a photo or a review decision is attributed to.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' } // field shift-length session; re-login next day
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, fullName: user.full_name },
  });
});

module.exports = router;
