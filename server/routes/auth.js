const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

const AVATAR_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55'];

router.post('/register', (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = getDb().prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username.toLowerCase(), email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }

    const hashedPassword = bcrypt.hashSync(password, 12);
    const id = uuidv4();
    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    getDb().prepare(
      'INSERT INTO users (id, username, display_name, email, password, avatar_color) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, username.toLowerCase(), displayName || username, email.toLowerCase(), hashedPassword, avatarColor);

    const user = getDb().prepare('SELECT id, username, display_name, email, avatar_color, status FROM users WHERE id = ?').get(id);
    const token = generateToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    const { password: _, ...userData } = user;

    res.json({ user: userData, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = getDb().prepare('SELECT id, username, display_name, email, avatar_color, status FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
