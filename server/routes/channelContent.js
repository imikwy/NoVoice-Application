const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ── Helpers ────────────────────────────────────────────────────────────────

function emitChannelUpdated(req, channelId) {
  const io = req.app.get('io');
  if (io && channelId) {
    io.to(`channel:${channelId}`).emit('channel:updated', { channelId });
  }
}

/** Returns the channel if found and the user is a server member. 403/404 otherwise. */
function getChannelForMember(channelId, userId, res) {
  const channel = getDb().prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return null;
  }
  const member = getDb()
    .prepare('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?')
    .get(channel.server_id, userId);
  if (!member) {
    res.status(403).json({ error: 'Not a member of this server' });
    return null;
  }
  return channel;
}

/** Returns the server, ensuring the user is the owner. */
function requireOwner(serverId, userId, res) {
  const server = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server || server.owner_id !== userId) {
    res.status(403).json({ error: 'Only the server owner can perform this action' });
    return null;
  }
  return server;
}

function ensureTaskCategories(channel, creatorId) {
  if (channel.type !== 'tasks') return;

  const hasCategories = getDb()
    .prepare('SELECT id FROM task_categories WHERE channel_id = ? LIMIT 1')
    .get(channel.id);

  const server = getDb()
    .prepare('SELECT owner_id FROM servers WHERE id = ?')
    .get(channel.server_id);
  const authorId = server?.owner_id || creatorId;

  if (!hasCategories) {
    const defaults = ['Backlog', 'In Progress', 'Done'];
    defaults.forEach((name, index) => {
      getDb()
        .prepare('INSERT INTO task_categories (id, channel_id, name, position, created_by) VALUES (?, ?, ?, ?, ?)')
        .run(uuidv4(), channel.id, name, index, authorId);
    });
  }

  const hasNewItems = getDb()
    .prepare('SELECT id FROM task_items WHERE channel_id = ? LIMIT 1')
    .get(channel.id);
  if (hasNewItems) return;

  const legacyTasks = getDb()
    .prepare('SELECT * FROM tasks WHERE channel_id = ? ORDER BY position ASC, created_at ASC')
    .all(channel.id);
  if (legacyTasks.length === 0) return;

  const createdCategories = getTaskCategories(channel.id);
  if (createdCategories.length === 0) return;

  const backlogCategory = createdCategories[0];
  const doneCategory = createdCategories[createdCategories.length - 1];
  let backlogPosition = 0;
  let donePosition = 0;

  const migrateLegacyTasks = getDb().transaction(() => {
    legacyTasks.forEach((task) => {
      const isCompleted = Boolean(task.completed);
      const categoryId = isCompleted ? doneCategory.id : backlogCategory.id;
      const nextPosition = isCompleted ? donePosition++ : backlogPosition++;

      getDb().prepare(`
        INSERT OR IGNORE INTO task_items
        (id, channel_id, category_id, title, description, completed, position, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        task.id || uuidv4(),
        channel.id,
        categoryId,
        task.title || 'Untitled Task',
        task.description || '',
        isCompleted ? 1 : 0,
        nextPosition,
        task.created_by || authorId,
        task.created_by || authorId,
        task.created_at || new Date().toISOString(),
        task.created_at || new Date().toISOString()
      );
    });

    // Prevent old rows from being re-imported if the new board is emptied later.
    getDb().prepare('DELETE FROM tasks WHERE channel_id = ?').run(channel.id);
  });

  migrateLegacyTasks();
}

function getTaskPermissions(channel, userId) {
  const server = getDb()
    .prepare('SELECT owner_id FROM servers WHERE id = ?')
    .get(channel.server_id);
  const isOwner = server?.owner_id === userId;
  if (isOwner) {
    return { isOwner: true, canEdit: true };
  }

  const editor = getDb()
    .prepare('SELECT id FROM task_channel_editors WHERE channel_id = ? AND user_id = ?')
    .get(channel.id, userId);

  return {
    isOwner: false,
    canEdit: Boolean(editor),
  };
}

function requireTaskEditor(channel, userId, res) {
  const permission = getTaskPermissions(channel, userId);
  if (!permission.canEdit) {
    res.status(403).json({ error: 'Only users with task edit permission can modify tasks' });
    return null;
  }
  return permission;
}

function getTaskCategories(channelId) {
  return getDb()
    .prepare('SELECT * FROM task_categories WHERE channel_id = ? ORDER BY position ASC, created_at ASC')
    .all(channelId);
}

function getTaskItems(channelId) {
  return getDb().prepare(`
    SELECT ti.*, u.username as created_by_username, u.display_name as created_by_display_name
    FROM task_items ti
    LEFT JOIN users u ON ti.created_by = u.id
    WHERE ti.channel_id = ?
    ORDER BY ti.position ASC, ti.created_at ASC
  `).all(channelId);
}

// ── Rules (hierarchical block-based editor) ────────────────────────────────

// GET all blocks — flat list, parent_id=null means top-level
router.get('/rules/:channelId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    const blocks = getDb()
      .prepare('SELECT * FROM rule_blocks WHERE channel_id = ? ORDER BY sort_order ASC, created_at ASC')
      .all(channel.id);
    res.json({
      blocks: blocks.map((b) => ({ ...b, content: JSON.parse(b.content || '{}') })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST add a new block
router.post('/rules/:channelId/blocks', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    if (!requireOwner(channel.server_id, req.user.id, res)) return;
    const { type, content, parent_id, sort_order, row_id, col_idx } = req.body;
    const id = uuidv4();
    getDb()
      .prepare('INSERT INTO rule_blocks (id, channel_id, type, content, parent_id, sort_order, row_id, col_idx) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, channel.id, type ?? 'text', JSON.stringify(content ?? {}), parent_id ?? null, sort_order ?? 0, row_id ?? null, col_idx ?? 0);
    const block = getDb().prepare('SELECT * FROM rule_blocks WHERE id = ?').get(id);
    emitChannelUpdated(req, channel.id);
    res.status(201).json({ block: { ...block, content: JSON.parse(block.content) } });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH update block content
router.patch('/rules/:channelId/blocks/:blockId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    if (!requireOwner(channel.server_id, req.user.id, res)) return;
    const block = getDb()
      .prepare('SELECT * FROM rule_blocks WHERE id = ? AND channel_id = ?')
      .get(req.params.blockId, channel.id);
    if (!block) return res.status(404).json({ error: 'Block not found' });
    getDb()
      .prepare('UPDATE rule_blocks SET content = ? WHERE id = ?')
      .run(JSON.stringify(req.body.content ?? {}), block.id);
    emitChannelUpdated(req, channel.id);
    res.json({ message: 'Block updated' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE a block — also cascades to children if it's a category
router.delete('/rules/:channelId/blocks/:blockId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    if (!requireOwner(channel.server_id, req.user.id, res)) return;
    getDb().transaction(() => {
      // Delete all children first (only 1 level deep possible)
      getDb().prepare('DELETE FROM rule_blocks WHERE parent_id = ? AND channel_id = ?').run(req.params.blockId, channel.id);
      getDb().prepare('DELETE FROM rule_blocks WHERE id = ? AND channel_id = ?').run(req.params.blockId, channel.id);
    })();
    emitChannelUpdated(req, channel.id);
    res.json({ message: 'Block deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH reorder — accepts [{ id, parent_id, sort_order, row_id, col_idx }]
router.patch('/rules/:channelId/reorder', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    if (!requireOwner(channel.server_id, req.user.id, res)) return;
    const { blocks } = req.body;
    if (!Array.isArray(blocks)) return res.status(400).json({ error: 'blocks array required' });
    const stmt = getDb().prepare(
      'UPDATE rule_blocks SET parent_id = ?, sort_order = ?, row_id = ?, col_idx = ? WHERE id = ? AND channel_id = ?'
    );
    for (const b of blocks) stmt.run(b.parent_id ?? null, b.sort_order ?? 0, b.row_id ?? null, b.col_idx ?? 0, b.id, channel.id);
    emitChannelUpdated(req, channel.id);
    res.json({ message: 'Reordered' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Calendar ───────────────────────────────────────────────────────────────

router.get('/calendar/:channelId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    const events = getDb()
      .prepare(`
        SELECT ce.*, u.username as creator_username, u.display_name as creator_display_name
        FROM calendar_events ce
        LEFT JOIN users u ON ce.created_by = u.id
        WHERE ce.channel_id = ?
        ORDER BY ce.start_date ASC
      `)
      .all(channel.id);
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/calendar/:channelId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    if (!requireOwner(channel.server_id, req.user.id, res)) return;
    const { title, description, start_date, end_date, color } = req.body;
    if (!title?.trim() || !start_date) {
      return res.status(400).json({ error: 'Title and start_date are required' });
    }
    const id = uuidv4();
    getDb().prepare(
      'INSERT INTO calendar_events (id, channel_id, title, description, start_date, end_date, color, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, channel.id, title.trim(), description ?? '', start_date, end_date ?? null, color ?? '#007AFF', req.user.id);
    const event = getDb().prepare(`
      SELECT ce.*, u.username as creator_username, u.display_name as creator_display_name
      FROM calendar_events ce
      LEFT JOIN users u ON ce.created_by = u.id
      WHERE ce.id = ?
    `).get(id);
    emitChannelUpdated(req, channel.id);
    res.status(201).json({ event });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/calendar/:channelId/:eventId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    if (!requireOwner(channel.server_id, req.user.id, res)) return;
    getDb().prepare('DELETE FROM calendar_events WHERE id = ? AND channel_id = ?')
      .run(req.params.eventId, channel.id);
    emitChannelUpdated(req, channel.id);
    res.json({ message: 'Event deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Announcements ──────────────────────────────────────────────────────────

router.get('/announcements/:channelId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    const announcements = getDb()
      .prepare(`
        SELECT a.*, u.username as creator_username, u.display_name as creator_display_name
        FROM announcements a
        LEFT JOIN users u ON a.created_by = u.id
        WHERE a.channel_id = ?
        ORDER BY a.created_at DESC
      `)
      .all(channel.id);
    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/announcements/:channelId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    if (!requireOwner(channel.server_id, req.user.id, res)) return;
    const { content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }
    const id = uuidv4();
    getDb().prepare(`
      INSERT INTO announcements (id, channel_id, title, content, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, channel.id, '', content.trim(), req.user.id);
    const announcement = getDb().prepare(`
      SELECT a.*, u.username as creator_username, u.display_name as creator_display_name
      FROM announcements a LEFT JOIN users u ON a.created_by = u.id
      WHERE a.id = ?
    `).get(id);
    emitChannelUpdated(req, channel.id);
    res.status(201).json({ announcement });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/announcements/:channelId/:announcementId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    if (!requireOwner(channel.server_id, req.user.id, res)) return;
    getDb().prepare('DELETE FROM announcements WHERE id = ? AND channel_id = ?')
      .run(req.params.announcementId, channel.id);
    emitChannelUpdated(req, channel.id);
    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Tasks ──────────────────────────────────────────────────────────────────

router.get('/tasks/:channelId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    if (channel.type !== 'tasks') {
      return res.status(400).json({ error: 'Channel is not a task manager channel' });
    }

    ensureTaskCategories(channel, req.user.id);

    const { canEdit, isOwner } = getTaskPermissions(channel, req.user.id);
    const categories = getTaskCategories(channel.id);
    const items = getTaskItems(channel.id);
    const editors = getDb().prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_color
      FROM task_channel_editors te
      JOIN users u ON te.user_id = u.id
      WHERE te.channel_id = ?
      ORDER BY te.created_at ASC
    `).all(channel.id);

    res.json({
      categories,
      items,
      permissions: { can_edit: canEdit, is_owner: isOwner },
      editors,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tasks/:channelId/editors', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    if (!requireOwner(channel.server_id, req.user.id, res)) return;

    const members = getDb().prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_color
      FROM server_members sm
      JOIN users u ON sm.user_id = u.id
      WHERE sm.server_id = ?
      ORDER BY u.display_name ASC
    `).all(channel.server_id);

    const editorRows = getDb()
      .prepare('SELECT user_id FROM task_channel_editors WHERE channel_id = ?')
      .all(channel.id);

    res.json({ members, editorIds: editorRows.map((row) => row.user_id) });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/tasks/:channelId/editors', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;

    const server = requireOwner(channel.server_id, req.user.id, res);
    if (!server) return;

    const userIds = Array.isArray(req.body.userIds) ? req.body.userIds : [];
    const memberRows = getDb()
      .prepare('SELECT user_id FROM server_members WHERE server_id = ?')
      .all(channel.server_id);
    const memberSet = new Set(memberRows.map((row) => row.user_id));

    const validEditorIds = [...new Set(userIds)]
      .filter((userId) => userId !== server.owner_id && memberSet.has(userId));

    const updateEditors = getDb().transaction(() => {
      getDb().prepare('DELETE FROM task_channel_editors WHERE channel_id = ?').run(channel.id);
      validEditorIds.forEach((userId) => {
        getDb().prepare(
          'INSERT INTO task_channel_editors (id, channel_id, user_id, granted_by) VALUES (?, ?, ?, ?)'
        ).run(uuidv4(), channel.id, userId, req.user.id);
      });
    });

    updateEditors();
    emitChannelUpdated(req, channel.id);
    res.json({ message: 'Task editors updated' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/tasks/:channelId/categories/reorder', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    ensureTaskCategories(channel, req.user.id);
    if (!requireTaskEditor(channel, req.user.id, res)) return;

    const categories = Array.isArray(req.body.categories) ? req.body.categories : [];
    if (!categories.length) {
      return res.status(400).json({ error: 'categories array is required' });
    }

    const validIds = new Set(
      getDb().prepare('SELECT id FROM task_categories WHERE channel_id = ?').all(channel.id).map((row) => row.id)
    );

    const reorder = getDb().transaction(() => {
      categories.forEach((entry, index) => {
        const categoryId = typeof entry === 'string' ? entry : entry.id;
        if (!validIds.has(categoryId)) return;
        const position = Number.isInteger(entry?.position) ? entry.position : index;
        getDb().prepare('UPDATE task_categories SET position = ? WHERE id = ?').run(position, categoryId);
      });
    });

    reorder();
    emitChannelUpdated(req, channel.id);
    res.json({ message: 'Categories reordered' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/tasks/:channelId/categories', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    if (channel.type !== 'tasks') {
      return res.status(400).json({ error: 'Channel is not a task manager channel' });
    }

    ensureTaskCategories(channel, req.user.id);
    if (!requireTaskEditor(channel, req.user.id, res)) return;

    const name = req.body?.name?.trim();
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const maxPos = getDb()
      .prepare('SELECT MAX(position) as max FROM task_categories WHERE channel_id = ?')
      .get(channel.id);
    const nextPosition = (maxPos?.max ?? -1) + 1;

    const id = uuidv4();
    getDb().prepare(
      'INSERT INTO task_categories (id, channel_id, name, position, created_by) VALUES (?, ?, ?, ?, ?)'
    ).run(id, channel.id, name, nextPosition, req.user.id);

    const category = getDb().prepare('SELECT * FROM task_categories WHERE id = ?').get(id);
    emitChannelUpdated(req, channel.id);
    res.status(201).json({ category });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/tasks/:channelId/categories/:categoryId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    ensureTaskCategories(channel, req.user.id);
    if (!requireTaskEditor(channel, req.user.id, res)) return;

    const category = getDb()
      .prepare('SELECT * FROM task_categories WHERE id = ? AND channel_id = ?')
      .get(req.params.categoryId, channel.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const name = req.body?.name?.trim();
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    getDb().prepare('UPDATE task_categories SET name = ? WHERE id = ?').run(name, category.id);
    emitChannelUpdated(req, channel.id);
    res.json({ message: 'Category updated' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/tasks/:channelId/categories/:categoryId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    ensureTaskCategories(channel, req.user.id);
    if (!requireTaskEditor(channel, req.user.id, res)) return;

    const category = getDb()
      .prepare('SELECT * FROM task_categories WHERE id = ? AND channel_id = ?')
      .get(req.params.categoryId, channel.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const categories = getTaskCategories(channel.id).filter((c) => c.id !== category.id);
    if (categories.length === 0) {
      return res.status(400).json({ error: 'At least one category is required' });
    }

    const targetCategory = categories[0];
    const movedItems = getDb()
      .prepare('SELECT * FROM task_items WHERE channel_id = ? AND category_id = ? ORDER BY position ASC')
      .all(channel.id, category.id);
    const targetMax = getDb()
      .prepare('SELECT MAX(position) as max FROM task_items WHERE channel_id = ? AND category_id = ?')
      .get(channel.id, targetCategory.id);
    const basePosition = (targetMax?.max ?? -1) + 1;

    const deleteCategory = getDb().transaction(() => {
      movedItems.forEach((item, index) => {
        getDb().prepare(
          'UPDATE task_items SET category_id = ?, position = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(targetCategory.id, basePosition + index, req.user.id, item.id);
      });
      getDb().prepare('DELETE FROM task_categories WHERE id = ?').run(category.id);
    });

    deleteCategory();
    emitChannelUpdated(req, channel.id);
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/tasks/:channelId/items/reorder', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    if (!requireTaskEditor(channel, req.user.id, res)) return;

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const categoryIds = new Set(
      getDb().prepare('SELECT id FROM task_categories WHERE channel_id = ?').all(channel.id).map((row) => row.id)
    );
    const existingItems = new Set(
      getDb().prepare('SELECT id FROM task_items WHERE channel_id = ?').all(channel.id).map((row) => row.id)
    );

    const reorder = getDb().transaction(() => {
      items.forEach((entry) => {
        if (!existingItems.has(entry.id) || !categoryIds.has(entry.category_id)) return;
        const position = Number.isInteger(entry.position) ? entry.position : 0;
        getDb().prepare(
          'UPDATE task_items SET category_id = ?, position = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(entry.category_id, position, req.user.id, entry.id);
      });
    });

    reorder();
    emitChannelUpdated(req, channel.id);
    res.json({ message: 'Task items reordered' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/tasks/:channelId/items', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    if (channel.type !== 'tasks') {
      return res.status(400).json({ error: 'Channel is not a task manager channel' });
    }

    ensureTaskCategories(channel, req.user.id);
    if (!requireTaskEditor(channel, req.user.id, res)) return;

    const title = req.body?.title?.trim();
    const description = req.body?.description ?? '';
    const requestedCategoryId = req.body?.category_id;

    if (!title) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const categories = getTaskCategories(channel.id);
    let categoryId = requestedCategoryId;
    if (categoryId) {
      const exists = categories.some((category) => category.id === categoryId);
      if (!exists) return res.status(400).json({ error: 'Invalid category' });
    } else {
      categoryId = categories[0]?.id;
    }

    const maxPos = getDb()
      .prepare('SELECT MAX(position) as max FROM task_items WHERE channel_id = ? AND category_id = ?')
      .get(channel.id, categoryId);
    const position = (maxPos?.max ?? -1) + 1;

    const id = uuidv4();
    getDb().prepare(
      'INSERT INTO task_items (id, channel_id, category_id, title, description, completed, position, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, channel.id, categoryId, title, description, 0, position, req.user.id, req.user.id);

    const item = getDb().prepare('SELECT * FROM task_items WHERE id = ?').get(id);
    emitChannelUpdated(req, channel.id);
    res.status(201).json({ item });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/tasks/:channelId/items/:itemId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    ensureTaskCategories(channel, req.user.id);
    if (!requireTaskEditor(channel, req.user.id, res)) return;

    const item = getDb()
      .prepare('SELECT * FROM task_items WHERE id = ? AND channel_id = ?')
      .get(req.params.itemId, channel.id);
    if (!item) {
      return res.status(404).json({ error: 'Task item not found' });
    }

    const categories = getTaskCategories(channel.id);
    const categoryIdFromBody = req.body?.category_id;
    let targetCategoryId = item.category_id;

    if (categoryIdFromBody !== undefined) {
      const exists = categories.some((category) => category.id === categoryIdFromBody);
      if (!exists) return res.status(400).json({ error: 'Invalid category' });
      targetCategoryId = categoryIdFromBody;
    }

    const title = req.body?.title;
    const description = req.body?.description;
    const completed = req.body?.completed;
    const requestedPosition = req.body?.position;

    if (title !== undefined && !String(title).trim()) {
      return res.status(400).json({ error: 'Task title cannot be empty' });
    }

    if (completed === true && categoryIdFromBody === undefined) {
      const currentIndex = categories.findIndex((category) => category.id === item.category_id);
      if (currentIndex >= 0 && currentIndex < categories.length - 1) {
        targetCategoryId = categories[currentIndex + 1].id;
      }
    }

    let nextPosition;
    if (Number.isInteger(requestedPosition)) {
      nextPosition = requestedPosition;
    } else if (targetCategoryId !== item.category_id) {
      const maxPos = getDb()
        .prepare('SELECT MAX(position) as max FROM task_items WHERE channel_id = ? AND category_id = ?')
        .get(channel.id, targetCategoryId);
      nextPosition = (maxPos?.max ?? -1) + 1;
    } else {
      nextPosition = item.position;
    }

    getDb().prepare(`
      UPDATE task_items
      SET
        title = ?,
        description = ?,
        completed = ?,
        category_id = ?,
        position = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title !== undefined ? String(title).trim() : item.title,
      description !== undefined ? description : item.description,
      completed !== undefined ? (completed ? 1 : 0) : item.completed,
      targetCategoryId,
      nextPosition,
      req.user.id,
      item.id
    );

    emitChannelUpdated(req, channel.id);
    res.json({ message: 'Task item updated' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/tasks/:channelId/items/:itemId/complete', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    ensureTaskCategories(channel, req.user.id);
    if (!requireTaskEditor(channel, req.user.id, res)) return;

    const item = getDb()
      .prepare('SELECT * FROM task_items WHERE id = ? AND channel_id = ?')
      .get(req.params.itemId, channel.id);
    if (!item) {
      return res.status(404).json({ error: 'Task item not found' });
    }

    const categories = getTaskCategories(channel.id);
    const currentIndex = categories.findIndex((category) => category.id === item.category_id);
    const nextCategory = currentIndex >= 0 && currentIndex < categories.length - 1
      ? categories[currentIndex + 1]
      : categories[currentIndex] || categories[0];

    const maxPos = getDb()
      .prepare('SELECT MAX(position) as max FROM task_items WHERE channel_id = ? AND category_id = ?')
      .get(channel.id, nextCategory.id);
    const nextPosition = (maxPos?.max ?? -1) + 1;

    getDb().prepare(
      'UPDATE task_items SET completed = 1, category_id = ?, position = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(nextCategory.id, nextPosition, req.user.id, item.id);

    emitChannelUpdated(req, channel.id);
    res.json({ message: 'Task completed' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/tasks/:channelId/items/:itemId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    if (!requireTaskEditor(channel, req.user.id, res)) return;

    getDb().prepare('DELETE FROM task_items WHERE id = ? AND channel_id = ?').run(req.params.itemId, channel.id);
    emitChannelUpdated(req, channel.id);
    res.json({ message: 'Task item deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/forum/:channelId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    const posts = getDb().prepare(`
      SELECT fp.*, u.username, u.display_name, u.avatar_color,
        (SELECT COUNT(*) FROM forum_replies WHERE post_id = fp.id) as reply_count
      FROM forum_posts fp
      JOIN users u ON fp.author_id = u.id
      WHERE fp.channel_id = ?
      ORDER BY fp.created_at DESC
    `).all(channel.id);
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/forum/:channelId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    const { title, content } = req.body;
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    const id = uuidv4();
    getDb().prepare('INSERT INTO forum_posts (id, channel_id, title, content, author_id) VALUES (?, ?, ?, ?, ?)')
      .run(id, channel.id, title.trim(), content.trim(), req.user.id);
    const post = getDb().prepare(`
      SELECT fp.*, u.username, u.display_name, u.avatar_color
      FROM forum_posts fp JOIN users u ON fp.author_id = u.id WHERE fp.id = ?
    `).get(id);
    emitChannelUpdated(req, channel.id);
    res.status(201).json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/forum/:channelId/:postId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    const post = getDb().prepare(`
      SELECT fp.*, u.username, u.display_name, u.avatar_color
      FROM forum_posts fp JOIN users u ON fp.author_id = u.id
      WHERE fp.id = ? AND fp.channel_id = ?
    `).get(req.params.postId, channel.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const replies = getDb().prepare(`
      SELECT fr.*, u.username, u.display_name, u.avatar_color
      FROM forum_replies fr JOIN users u ON fr.author_id = u.id
      WHERE fr.post_id = ? ORDER BY fr.created_at ASC
    `).all(post.id);
    res.json({ post, replies });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/forum/:channelId/:postId/replies', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    const post = getDb().prepare('SELECT id FROM forum_posts WHERE id = ? AND channel_id = ?').get(req.params.postId, channel.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
    const id = uuidv4();
    getDb().prepare('INSERT INTO forum_replies (id, post_id, content, author_id) VALUES (?, ?, ?, ?)')
      .run(id, post.id, content.trim(), req.user.id);
    const reply = getDb().prepare(`
      SELECT fr.*, u.username, u.display_name, u.avatar_color
      FROM forum_replies fr JOIN users u ON fr.author_id = u.id WHERE fr.id = ?
    `).get(id);
    emitChannelUpdated(req, channel.id);
    res.status(201).json({ reply });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/forum/:channelId/:postId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    const post = getDb().prepare('SELECT * FROM forum_posts WHERE id = ? AND channel_id = ?').get(req.params.postId, channel.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const server = getDb().prepare('SELECT owner_id FROM servers WHERE id = ?').get(channel.server_id);
    if (server?.owner_id !== req.user.id && post.author_id !== req.user.id) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    getDb().transaction(() => {
      getDb().prepare('DELETE FROM forum_replies WHERE post_id = ?').run(post.id);
      getDb().prepare('DELETE FROM forum_posts WHERE id = ?').run(post.id);
    })();
    emitChannelUpdated(req, channel.id);
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/forum/:channelId/:postId/replies/:replyId', authenticateToken, (req, res) => {
  try {
    const channel = getChannelForMember(req.params.channelId, req.user.id, res);
    if (!channel) return;
    const reply = getDb().prepare('SELECT * FROM forum_replies WHERE id = ?').get(req.params.replyId);
    if (!reply) return res.status(404).json({ error: 'Reply not found' });
    const server = getDb().prepare('SELECT owner_id FROM servers WHERE id = ?').get(channel.server_id);
    if (server?.owner_id !== req.user.id && reply.author_id !== req.user.id) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    getDb().prepare('DELETE FROM forum_replies WHERE id = ?').run(reply.id);
    emitChannelUpdated(req, channel.id);
    res.json({ message: 'Reply deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
