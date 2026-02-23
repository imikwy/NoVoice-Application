const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { customAlphabet } = require('nanoid');
const { getDb } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const generateInviteCode = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', 8);

const SERVER_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#5AC8FA', '#64D2FF'];

function emitServerUpdated(req, serverId) {
  const io = req.app.get('io');
  if (!io || !serverId) return;

  io.to(`server:${serverId}`).emit('server:updated', { serverId });

  const members = getDb().prepare('SELECT user_id FROM server_members WHERE server_id = ?').all(serverId);
  members.forEach(({ user_id }) => {
    io.to(`user:${user_id}`).emit('server:updated', { serverId });
  });
}

// Get user's servers
router.get('/', authenticateToken, (req, res) => {
  try {
    const servers = getDb().prepare(`
      SELECT s.*, sm.joined_at,
        (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count
      FROM servers s
      JOIN server_members sm ON s.id = sm.server_id
      WHERE sm.user_id = ?
      ORDER BY sm.joined_at ASC
    `).all(req.user.id);

    res.json({ servers });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create server — supports three hosting types: 'novoice', 'own', 'local'
router.post('/', authenticateToken, (req, res) => {
  try {
    const { name, server_type, server_url } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Server name must be at least 2 characters' });
    }

    const validTypes = ['novoice', 'own', 'local'];
    const sType = validTypes.includes(server_type) ? server_type : 'novoice';

    let sUrl = null;
    if ((sType === 'own' || sType === 'local') && server_url) {
      try {
        const parsed = new URL(server_url.trim());
        sUrl = `${parsed.protocol}//${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}`;
      } catch {
        return res.status(400).json({ error: 'Invalid server URL' });
      }
    }

    const createDefaultChannels = sType === 'novoice';

    const id = uuidv4();
    const inviteCode = generateInviteCode();
    const iconColor = SERVER_COLORS[Math.floor(Math.random() * SERVER_COLORS.length)];

    const createServer = getDb().transaction(() => {
      getDb().prepare(
        'INSERT INTO servers (id, name, owner_id, invite_code, icon_color, server_type, server_url) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, name.trim(), req.user.id, inviteCode, iconColor, sType, sUrl);

      getDb().prepare('INSERT INTO server_members (id, server_id, user_id) VALUES (?, ?, ?)').run(
        uuidv4(), id, req.user.id
      );

      if (createDefaultChannels) {
        getDb().prepare('INSERT INTO channels (id, server_id, name, type, position) VALUES (?, ?, ?, ?, ?)').run(
          uuidv4(), id, 'general', 'text', 0
        );
        getDb().prepare('INSERT INTO channels (id, server_id, name, type, position) VALUES (?, ?, ?, ?, ?)').run(
          uuidv4(), id, 'General', 'voice', 1
        );
      }
    });

    createServer();
    emitServerUpdated(req, id);

    const server = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(id);
    res.status(201).json({ server });
  } catch (err) {
    console.error('Create server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Join server by invite code
router.post('/join', authenticateToken, (req, res) => {
  try {
    const { inviteCode } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ error: 'Invite code required' });
    }

    const server = getDb().prepare('SELECT * FROM servers WHERE invite_code = ?').get(inviteCode);
    if (!server) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    const existing = getDb().prepare('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?').get(
      server.id, req.user.id
    );
    if (existing) {
      return res.status(400).json({ error: 'Already a member of this server' });
    }

    getDb().prepare('INSERT INTO server_members (id, server_id, user_id) VALUES (?, ?, ?)').run(
      uuidv4(), server.id, req.user.id
    );
    emitServerUpdated(req, server.id);

    res.json({ server });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get server details (includes categories)
router.get('/:serverId', authenticateToken, (req, res) => {
  try {
    const { serverId } = req.params;

    const member = getDb().prepare('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?').get(
      serverId, req.user.id
    );
    if (!member) {
      return res.status(403).json({ error: 'Not a member of this server' });
    }

    const server = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    const categories = getDb().prepare('SELECT * FROM categories WHERE server_id = ? ORDER BY position').all(serverId);
    const channels = getDb().prepare('SELECT * FROM channels WHERE server_id = ? ORDER BY position').all(serverId);
    const members = getDb().prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_color, u.status
      FROM server_members sm
      JOIN users u ON sm.user_id = u.id
      WHERE sm.server_id = ?
    `).all(serverId);

    res.json({ server, categories, channels, members });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update server (name, icon_color) — owner only
router.patch('/:serverId', authenticateToken, (req, res) => {
  try {
    const { serverId } = req.params;
    const { name, icon_color } = req.body;

    const server = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    if (!server || server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the server owner can update server settings' });
    }

    if (name !== undefined) {
      if (!name.trim() || name.trim().length < 2) {
        return res.status(400).json({ error: 'Server name must be at least 2 characters' });
      }
      getDb().prepare('UPDATE servers SET name = ? WHERE id = ?').run(name.trim(), serverId);
    }

    if (icon_color !== undefined) {
      getDb().prepare('UPDATE servers SET icon_color = ? WHERE id = ?').run(icon_color, serverId);
    }

    emitServerUpdated(req, serverId);
    const updated = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    res.json({ server: updated });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create channel — owner only
router.post('/:serverId/channels', authenticateToken, (req, res) => {
  try {
    const { serverId } = req.params;
    const { name, type, category_id } = req.body;

    const server = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    if (!server || server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the server owner can create channels' });
    }

    if (!name || name.trim().length < 1) {
      return res.status(400).json({ error: 'Channel name required' });
    }

    let validCategoryId = null;
    if (category_id) {
      const cat = getDb().prepare('SELECT id FROM categories WHERE id = ? AND server_id = ?').get(category_id, serverId);
      if (cat) validCategoryId = category_id;
    }

    const VALID_TYPES = ['text', 'voice', 'announcements', 'rules', 'calendar', 'tasks', 'forum'];
    const channelType = VALID_TYPES.includes(type) ? type : 'text';
    const maxPos = getDb().prepare('SELECT MAX(position) as max FROM channels WHERE server_id = ?').get(serverId);
    const position = (maxPos.max || 0) + 1;

    const id = uuidv4();
    getDb().prepare('INSERT INTO channels (id, server_id, name, type, position, category_id) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, serverId, name.trim(), channelType, position, validCategoryId
    );

    if (channelType === 'tasks') {
      const defaultTaskColumns = ['Backlog', 'In Progress', 'Done'];
      defaultTaskColumns.forEach((columnName, index) => {
        getDb().prepare(
          'INSERT INTO task_categories (id, channel_id, name, position, created_by) VALUES (?, ?, ?, ?, ?)'
        ).run(uuidv4(), id, columnName, index, req.user.id);
      });
    }

    emitServerUpdated(req, serverId);

    const channel = getDb().prepare('SELECT * FROM channels WHERE id = ?').get(id);
    res.status(201).json({ channel });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update channel (name, category_id) — owner only
router.patch('/:serverId/channels/:channelId', authenticateToken, (req, res) => {
  try {
    const { serverId, channelId } = req.params;
    const { name, category_id } = req.body;

    const server = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    if (!server || server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the server owner can update channels' });
    }

    if (name !== undefined && name.trim()) {
      getDb().prepare('UPDATE channels SET name = ? WHERE id = ? AND server_id = ?').run(name.trim(), channelId, serverId);
    }

    if (category_id !== undefined) {
      getDb().prepare('UPDATE channels SET category_id = ? WHERE id = ? AND server_id = ?').run(
        category_id === null ? null : category_id, channelId, serverId
      );
    }

    emitServerUpdated(req, serverId);
    res.json({ message: 'Channel updated' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete channel — owner only
router.delete('/:serverId/channels/:channelId', authenticateToken, (req, res) => {
  try {
    const { serverId, channelId } = req.params;

    const server = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    if (!server || server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the server owner can delete channels' });
    }

    const deleteChannel = getDb().transaction(() => {
      getDb().prepare('DELETE FROM tasks WHERE channel_id = ?').run(channelId);
      getDb().prepare('DELETE FROM task_items WHERE channel_id = ?').run(channelId);
      getDb().prepare('DELETE FROM task_categories WHERE channel_id = ?').run(channelId);
      getDb().prepare('DELETE FROM task_channel_editors WHERE channel_id = ?').run(channelId);
      getDb().prepare('DELETE FROM calendar_events WHERE channel_id = ?').run(channelId);
      getDb().prepare('DELETE FROM forum_replies WHERE post_id IN (SELECT id FROM forum_posts WHERE channel_id = ?)').run(channelId);
      getDb().prepare('DELETE FROM forum_posts WHERE channel_id = ?').run(channelId);
      getDb().prepare('DELETE FROM rule_blocks WHERE channel_id = ?').run(channelId);
      getDb().prepare('DELETE FROM messages WHERE channel_id = ?').run(channelId);
      getDb().prepare('DELETE FROM channels WHERE id = ? AND server_id = ?').run(channelId, serverId);
    });

    deleteChannel();
    emitServerUpdated(req, serverId);
    res.json({ message: 'Channel deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create category — owner only
router.post('/:serverId/categories', authenticateToken, (req, res) => {
  try {
    const { serverId } = req.params;
    const { name } = req.body;

    const server = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    if (!server || server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the server owner can create categories' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name required' });
    }

    const maxPos = getDb().prepare('SELECT MAX(position) as max FROM categories WHERE server_id = ?').get(serverId);
    const position = (maxPos.max !== null ? maxPos.max : -1) + 1;

    const id = uuidv4();
    getDb().prepare('INSERT INTO categories (id, server_id, name, position) VALUES (?, ?, ?, ?)').run(
      id, serverId, name.trim(), position
    );
    emitServerUpdated(req, serverId);

    const category = getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id);
    res.status(201).json({ category });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update category (rename) — owner only
router.patch('/:serverId/categories/:categoryId', authenticateToken, (req, res) => {
  try {
    const { serverId, categoryId } = req.params;
    const { name } = req.body;

    const server = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    if (!server || server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the server owner can update categories' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name required' });
    }

    getDb().prepare('UPDATE categories SET name = ? WHERE id = ? AND server_id = ?').run(name.trim(), categoryId, serverId);
    emitServerUpdated(req, serverId);
    res.json({ message: 'Category updated' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete category — channels become uncategorized — owner only
router.delete('/:serverId/categories/:categoryId', authenticateToken, (req, res) => {
  try {
    const { serverId, categoryId } = req.params;

    const server = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    if (!server || server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the server owner can delete categories' });
    }

    const deleteCategory = getDb().transaction(() => {
      getDb().prepare('UPDATE channels SET category_id = NULL WHERE category_id = ? AND server_id = ?').run(categoryId, serverId);
      getDb().prepare('DELETE FROM categories WHERE id = ? AND server_id = ?').run(categoryId, serverId);
    });

    deleteCategory();
    emitServerUpdated(req, serverId);
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk reorder channels and categories — owner only
router.post('/:serverId/reorder', authenticateToken, (req, res) => {
  try {
    const { serverId } = req.params;
    const { channels, categories } = req.body;

    const server = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    if (!server || server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the server owner can reorder channels' });
    }

    const reorder = getDb().transaction(() => {
      if (Array.isArray(channels)) {
        for (const { id, position, category_id } of channels) {
          getDb().prepare(
            'UPDATE channels SET position = ?, category_id = ? WHERE id = ? AND server_id = ?'
          ).run(position, category_id ?? null, id, serverId);
        }
      }
      if (Array.isArray(categories)) {
        for (const { id, position } of categories) {
          getDb().prepare(
            'UPDATE categories SET position = ? WHERE id = ? AND server_id = ?'
          ).run(position, id, serverId);
        }
      }
    });

    reorder();
    emitServerUpdated(req, serverId);
    res.json({ message: 'Reordered successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete server — owner only
router.delete('/:serverId', authenticateToken, (req, res) => {
  try {
    const { serverId } = req.params;

    const server = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    if (!server || server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the server owner can delete the server' });
    }

    const memberIds = getDb().prepare('SELECT user_id FROM server_members WHERE server_id = ?').all(serverId);

    const deleteServer = getDb().transaction(() => {
      getDb().prepare('DELETE FROM tasks WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?)').run(serverId);
      getDb().prepare('DELETE FROM task_items WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?)').run(serverId);
      getDb().prepare('DELETE FROM task_categories WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?)').run(serverId);
      getDb().prepare('DELETE FROM task_channel_editors WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?)').run(serverId);
      getDb().prepare('DELETE FROM calendar_events WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?)').run(serverId);
      getDb().prepare('DELETE FROM forum_replies WHERE post_id IN (SELECT id FROM forum_posts WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?))').run(serverId);
      getDb().prepare('DELETE FROM forum_posts WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?)').run(serverId);
      getDb().prepare('DELETE FROM rule_blocks WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?)').run(serverId);
      getDb().prepare('DELETE FROM messages WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?)').run(serverId);
      getDb().prepare('DELETE FROM channels WHERE server_id = ?').run(serverId);
      getDb().prepare('DELETE FROM categories WHERE server_id = ?').run(serverId);
      getDb().prepare('DELETE FROM server_members WHERE server_id = ?').run(serverId);
      getDb().prepare('DELETE FROM servers WHERE id = ?').run(serverId);
    });

    deleteServer();
    const io = req.app.get('io');
    if (io) {
      memberIds.forEach(({ user_id }) => {
        io.to(`user:${user_id}`).emit('server:deleted', { serverId });
      });
    }

    res.json({ message: 'Server deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Leave server
router.post('/:serverId/leave', authenticateToken, (req, res) => {
  try {
    const { serverId } = req.params;

    const server = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    if (server && server.owner_id === req.user.id) {
      return res.status(400).json({ error: 'Owner cannot leave. Delete the server instead.' });
    }

    getDb().prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(serverId, req.user.id);
    emitServerUpdated(req, serverId);
    res.json({ message: 'Left server' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
