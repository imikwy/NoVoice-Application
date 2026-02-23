const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get messages for a channel
router.get('/:channelId', authenticateToken, (req, res) => {
  try {
    const { channelId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before;

    // Verify user is member of the server this channel belongs to
    const channel = getDb().prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const member = getDb().prepare('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?').get(
      channel.server_id, req.user.id
    );
    if (!member) {
      return res.status(403).json({ error: 'Not a member of this server' });
    }

    let query = `
      SELECT m.*, u.username, u.display_name, u.avatar_color
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.channel_id = ?
    `;
    const params = [channelId];

    if (before) {
      query += ' AND m.created_at < ?';
      params.push(before);
    }

    query += ' ORDER BY m.created_at DESC LIMIT ?';
    params.push(limit);

    const messages = getDb().prepare(query).all(...params);
    res.json({ messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send message to channel
router.post('/:channelId', authenticateToken, (req, res) => {
  try {
    const { channelId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content required' });
    }

    const channel = getDb().prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const writableTypes = ['text', 'announcements'];
    if (!writableTypes.includes(channel.type)) {
      return res.status(400).json({ error: 'Cannot send messages to this channel type' });
    }

    // Announcements: only server owner can post
    if (channel.type === 'announcements') {
      const server = getDb().prepare('SELECT owner_id FROM servers WHERE id = ?').get(channel.server_id);
      if (!server || server.owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Only the server owner can post in announcements channels' });
      }
    }

    const member = getDb().prepare('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?').get(
      channel.server_id, req.user.id
    );
    if (!member) {
      return res.status(403).json({ error: 'Not a member of this server' });
    }

    const id = uuidv4();
    getDb().prepare('INSERT INTO messages (id, channel_id, sender_id, content) VALUES (?, ?, ?, ?)').run(
      id, channelId, req.user.id, content.trim()
    );

    const message = getDb().prepare(`
      SELECT m.*, u.username, u.display_name, u.avatar_color
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `).get(id);

    res.status(201).json({ message });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
