const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const { JWT_SECRET } = require('../middleware/auth');

const onlineUsers = new Map(); // userId -> Set of socket ids
const voiceChannelMembers = new Map(); // channelId -> Map<userId, user summary>
const socketVoiceChannel = new Map(); // socketId -> channelId
const voiceChannelServerMap = new Map(); // channelId -> serverId

const DM_EXPIRY_DAYS = 7;

function getVoiceParticipants(channelId) {
  const members = voiceChannelMembers.get(channelId);
  if (!members) return [];
  return [...members.values()];
}

function hasUserInVoiceRoom(io, channelId, userId) {
  const room = io.sockets.adapter.rooms.get(`voice:${channelId}`);
  if (!room) return false;
  for (const socketId of room) {
    const roomSocket = io.sockets.sockets.get(socketId);
    if (roomSocket?.user?.id === userId) return true;
  }
  return false;
}

function emitVoiceState(io, channelId) {
  const participants = getVoiceParticipants(channelId);
  io.to(`voice:${channelId}`).emit('voice:state', { channelId, participants });

  const serverId = voiceChannelServerMap.get(channelId);
  if (serverId) {
    io.to(`server:${serverId}`).emit('voice:channel:update', {
      channelId,
      participantCount: participants.length,
      participants,
    });
  }
}

function leaveVoiceChannel(io, socket) {
  const channelId = socketVoiceChannel.get(socket.id);
  if (!channelId) return;

  socketVoiceChannel.delete(socket.id);
  socket.leave(`voice:${channelId}`);

  const userId = socket.user.id;
  const members = voiceChannelMembers.get(channelId);
  if (members && !hasUserInVoiceRoom(io, channelId, userId)) {
    members.delete(userId);
    if (members.size === 0) voiceChannelMembers.delete(channelId);
  }

  emitVoiceState(io, channelId);
}

// Deliver DMs stored while the user was offline — ephemeral, deleted after delivery
function deliverPendingDMs(socket, userId) {
  const now = new Date().toISOString();
  const pending = getDb().prepare(`
    SELECT pd.*, u.username, u.display_name, u.avatar_color
    FROM pending_dms pd
    JOIN users u ON pd.sender_id = u.id
    WHERE pd.receiver_id = ? AND pd.expires_at > ?
    ORDER BY pd.created_at ASC
  `).all(userId, now);

  if (pending.length === 0) return;

  for (const dm of pending) {
    socket.emit('dm:new', { message: dm, wasPending: true });
  }

  // Delete immediately after delivery (ephemeral storage)
  getDb().prepare('DELETE FROM pending_dms WHERE receiver_id = ?').run(userId);

  // Opportunistic cleanup of any other expired DMs
  getDb().prepare("DELETE FROM pending_dms WHERE expires_at <= ?").run(now);
}

function setupWebSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = decoded;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    getDb().prepare('UPDATE users SET status = ? WHERE id = ?').run('online', userId);
    io.emit('user:status', { userId, status: 'online' });

    const servers = getDb().prepare(
      'SELECT server_id FROM server_members WHERE user_id = ?'
    ).all(userId);
    servers.forEach((s) => socket.join(`server:${s.server_id}`));

    socket.join(`user:${userId}`);

    // Deliver messages stored during offline period
    deliverPendingDMs(socket, userId);

    socket.on('server:subscribe', (data) => {
      const serverId = data?.serverId;
      if (!serverId) return;
      const member = getDb().prepare(
        'SELECT id FROM server_members WHERE server_id = ? AND user_id = ?'
      ).get(serverId, userId);
      if (!member) return;
      socket.join(`server:${serverId}`);
    });

    socket.on('server:unsubscribe', (data) => {
      const serverId = data?.serverId;
      if (!serverId) return;
      socket.leave(`server:${serverId}`);
    });

    // Channel messages (stored on NoVoice Cloud servers)
    socket.on('message:send', (data) => {
      const { channelId, content } = data;
      if (!content || !content.trim()) return;

      const channel = getDb().prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
      if (!channel) return;

      const member = getDb().prepare(
        'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?'
      ).get(channel.server_id, userId);
      if (!member) return;

      const id = uuidv4();
      getDb().prepare(
        'INSERT INTO messages (id, channel_id, sender_id, content) VALUES (?, ?, ?, ?)'
      ).run(id, channelId, userId, content.trim());

      const message = getDb().prepare(`
        SELECT m.*, u.username, u.display_name, u.avatar_color
        FROM messages m JOIN users u ON m.sender_id = u.id
        WHERE m.id = ?
      `).get(id);

      io.to(`server:${channel.server_id}`).emit('message:new', { channelId, message });
    });

    // Direct messages — relay-only with offline delivery fallback
    socket.on('dm:send', (data) => {
      const { receiverId, content } = data;
      if (!content || !content.trim() || !receiverId) return;

      const sender = getDb().prepare(
        'SELECT id, username, display_name, avatar_color FROM users WHERE id = ?'
      ).get(userId);
      if (!sender) return;

      const message = {
        id: uuidv4(),
        sender_id: userId,
        receiver_id: receiverId,
        content: content.trim(),
        created_at: new Date().toISOString(),
        username: sender.username,
        display_name: sender.display_name,
        avatar_color: sender.avatar_color,
      };

      const receiverOnline = onlineUsers.has(receiverId);

      if (receiverOnline) {
        // Online: relay immediately, nothing stored
        io.to(`user:${receiverId}`).emit('dm:new', { message });
      } else {
        // Offline: store temporarily for delivery when they reconnect (7-day TTL)
        const expires = new Date();
        expires.setDate(expires.getDate() + DM_EXPIRY_DAYS);
        getDb().prepare(
          'INSERT OR IGNORE INTO pending_dms (id, sender_id, receiver_id, content, expires_at) VALUES (?, ?, ?, ?, ?)'
        ).run(message.id, userId, receiverId, message.content, expires.toISOString());
      }

      // Echo back to all sender's devices (multi-device support)
      io.to(`user:${userId}`).emit('dm:new', { message });
    });

    // Voice: join channel
    socket.on('voice:join', (data) => {
      const channelId = data?.channelId;
      if (!channelId) return;

      const channel = getDb().prepare(
        'SELECT id, server_id, type FROM channels WHERE id = ?'
      ).get(channelId);
      if (!channel || channel.type !== 'voice') return;

      const member = getDb().prepare(
        'SELECT id FROM server_members WHERE server_id = ? AND user_id = ?'
      ).get(channel.server_id, userId);
      if (!member) return;

      const currentChannelId = socketVoiceChannel.get(socket.id);
      if (currentChannelId && currentChannelId !== channelId) {
        leaveVoiceChannel(io, socket);
      } else if (currentChannelId === channelId) {
        emitVoiceState(io, channelId);
        return;
      }

      socket.join(`voice:${channelId}`);
      socketVoiceChannel.set(socket.id, channelId);
      voiceChannelServerMap.set(channelId, channel.server_id);

      if (!voiceChannelMembers.has(channelId)) {
        voiceChannelMembers.set(channelId, new Map());
      }

      const voiceMember = getDb().prepare(
        'SELECT id, username, display_name, avatar_color FROM users WHERE id = ?'
      ).get(userId);
      if (voiceMember) {
        voiceChannelMembers.get(channelId).set(userId, voiceMember);
      }

      emitVoiceState(io, channelId);
    });

    socket.on('voice:leave', () => leaveVoiceChannel(io, socket));

    socket.on('voice:state:request', (data) => {
      const channelId = data?.channelId;
      if (!channelId) return;

      const channel = getDb().prepare(
        'SELECT id, server_id, type FROM channels WHERE id = ?'
      ).get(channelId);
      if (!channel || channel.type !== 'voice') return;

      const member = getDb().prepare(
        'SELECT id FROM server_members WHERE server_id = ? AND user_id = ?'
      ).get(channel.server_id, userId);
      if (!member) return;

      socket.emit('voice:state', { channelId, participants: getVoiceParticipants(channelId) });
    });

    socket.on('voice:signal', (data) => {
      const { channelId, targetUserId, signal } = data;
      if (!channelId || !targetUserId || !signal || targetUserId === userId) return;
      if (socketVoiceChannel.get(socket.id) !== channelId) return;

      const members = voiceChannelMembers.get(channelId);
      if (!members || !members.has(targetUserId)) return;

      io.to(`user:${targetUserId}`).emit('voice:signal', { channelId, fromUserId: userId, signal });
    });

    // Typing indicators
    socket.on('typing:start', (data) => {
      const { channelId, isDM, targetId } = data;
      const user = getDb().prepare('SELECT username, display_name FROM users WHERE id = ?').get(userId);
      if (!user) return;

      if (isDM) {
        io.to(`user:${targetId}`).emit('typing:update', {
          userId, username: user.display_name, channelId: targetId, isDM: true, isTyping: true,
        });
      } else {
        const channel = getDb().prepare('SELECT server_id FROM channels WHERE id = ?').get(channelId);
        if (channel) {
          socket.to(`server:${channel.server_id}`).emit('typing:update', {
            userId, username: user.display_name, channelId, isTyping: true,
          });
        }
      }
    });

    socket.on('typing:stop', (data) => {
      const { channelId, isDM, targetId } = data;
      if (isDM) {
        io.to(`user:${targetId}`).emit('typing:update', {
          userId, channelId: targetId, isDM: true, isTyping: false,
        });
      } else {
        const channel = getDb().prepare('SELECT server_id FROM channels WHERE id = ?').get(channelId);
        if (channel) {
          socket.to(`server:${channel.server_id}`).emit('typing:update', {
            userId, channelId, isTyping: false,
          });
        }
      }
    });

    socket.on('friend:request', (data) => {
      io.to(`user:${data.targetId}`).emit('friend:request-received', { from: userId });
    });

    // ── Channel content subscriptions (calendar, tasks, forum, rules) ──────
    socket.on('channel:subscribe', ({ channelId }) => {
      if (channelId) socket.join(`channel:${channelId}`);
    });
    socket.on('channel:unsubscribe', ({ channelId }) => {
      if (channelId) socket.leave(`channel:${channelId}`);
    });

    socket.on('disconnect', () => {
      leaveVoiceChannel(io, socket);

      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          getDb().prepare('UPDATE users SET status = ? WHERE id = ?').run('offline', userId);
          io.emit('user:status', { userId, status: 'offline' });
        }
      }
    });
  });
}

module.exports = { setupWebSocket, onlineUsers };
