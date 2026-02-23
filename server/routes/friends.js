const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function emitFriendUpdated(req, userIds) {
  const io = req.app.get('io');
  if (!io) return;

  [...new Set(userIds.filter(Boolean))].forEach((userId) => {
    io.to(`user:${userId}`).emit('friend:updated');
  });
}

// Get all friends
router.get('/', authenticateToken, (req, res) => {
  try {
    const friends = getDb().prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_color, u.status, f.status as friendship_status
      FROM friendships f
      JOIN users u ON (
        CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
      ) = u.id
      WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
    `).all(req.user.id, req.user.id, req.user.id);

    res.json({ friends });
  } catch (err) {
    console.error('Get friends error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pending friend requests
router.get('/pending', authenticateToken, (req, res) => {
  try {
    const incoming = getDb().prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_color, f.id as request_id
      FROM friendships f
      JOIN users u ON f.user_id = u.id
      WHERE f.friend_id = ? AND f.status = 'pending'
    `).all(req.user.id);

    const outgoing = getDb().prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_color, f.id as request_id
      FROM friendships f
      JOIN users u ON f.friend_id = u.id
      WHERE f.user_id = ? AND f.status = 'pending'
    `).all(req.user.id);

    res.json({ incoming, outgoing });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send friend request by username
router.post('/add', authenticateToken, (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const targetUser = getDb().prepare('SELECT id, username, display_name, avatar_color FROM users WHERE username = ?').get(username.toLowerCase());
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot add yourself as a friend' });
    }

    const existing = getDb().prepare(
      'SELECT * FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'
    ).get(req.user.id, targetUser.id, targetUser.id, req.user.id);

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'Already friends' });
      }
      return res.status(400).json({ error: 'Friend request already pending' });
    }

    const id = uuidv4();
    getDb().prepare('INSERT INTO friendships (id, user_id, friend_id, status) VALUES (?, ?, ?, ?)').run(
      id, req.user.id, targetUser.id, 'pending'
    );
    emitFriendUpdated(req, [req.user.id]);

    const io = req.app.get('io');
    io?.to(`user:${targetUser.id}`).emit('friend:request-received', {
      from: req.user.id,
    });

    res.status(201).json({ message: 'Friend request sent', friend: targetUser });
  } catch (err) {
    console.error('Add friend error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Accept friend request
router.post('/accept/:requestId', authenticateToken, (req, res) => {
  try {
    const { requestId } = req.params;
    const request = getDb().prepare('SELECT * FROM friendships WHERE id = ? AND friend_id = ? AND status = ?').get(
      requestId, req.user.id, 'pending'
    );

    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    getDb().prepare('UPDATE friendships SET status = ? WHERE id = ?').run('accepted', requestId);
    emitFriendUpdated(req, [request.user_id, request.friend_id]);

    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Decline/remove friend
router.delete('/:friendId', authenticateToken, (req, res) => {
  try {
    const { friendId } = req.params;
    getDb().prepare(
      'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'
    ).run(req.user.id, friendId, friendId, req.user.id);
    emitFriendUpdated(req, [req.user.id, friendId]);

    res.json({ message: 'Friend removed' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DMs are relay-only — no history stored (privacy by design)
router.get('/dm/:friendId', authenticateToken, (_req, res) => {
  res.json({ messages: [] });
});

// Send DM via HTTP — relays through Socket.IO, never stored
router.post('/dm/:friendId', authenticateToken, (req, res) => {
  try {
    const { friendId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content required' });
    }

    const sender = getDb().prepare(
      'SELECT id, username, display_name, avatar_color FROM users WHERE id = ?'
    ).get(req.user.id);

    const message = {
      id: uuidv4(),
      sender_id: req.user.id,
      receiver_id: friendId,
      content: content.trim(),
      created_at: new Date().toISOString(),
      username: sender.username,
      display_name: sender.display_name,
      avatar_color: sender.avatar_color,
    };

    // Relay via Socket.IO — not written to DB
    const io = req.app.get('io');
    io?.to(`user:${req.user.id}`).to(`user:${friendId}`).emit('dm:new', { message });

    res.status(201).json({ message });
  } catch (err) {
    console.error('Send DM error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
