const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const { JWT_SECRET } = require('../middleware/auth');

const onlineUsers = new Map(); // userId -> Set of socket ids
const voiceChannelMembers = new Map(); // channelId -> Map<userId, user summary>
const socketVoiceChannel = new Map(); // socketId -> channelId
const voiceChannelServerMap = new Map(); // channelId -> serverIdasdasd
const voiceMusicSessions = new Map(); // channelId -> synced queue + transport state

const DM_EXPIRY_DAYS = 7;
const MAX_VOICE_MUSIC_QUEUE = 100;
const MAX_VOICE_MUSIC_SEEK_SECONDS = 12 * 60 * 60;

function clampMusicSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(MAX_VOICE_MUSIC_SEEK_SECONDS, Math.round(numeric * 1000) / 1000));
}

function normalizeLabel(value, fallback = '', maxLength = 140) {
  const cleaned = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, maxLength);
}

function inferTrackTitle(urlObj) {
  const pathPart = decodeURIComponent(urlObj.pathname || '/')
    .split('/')
    .filter(Boolean)
    .pop() || '';
  const titleLike = pathPart.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[-_]+/g, ' ').trim();
  if (titleLike) return titleLike.slice(0, 140);
  return urlObj.hostname.replace(/^www\./, '');
}

function extractYouTubeVideoId(urlObj) {
  const host = urlObj.hostname.toLowerCase();
  if (host.includes('youtu.be')) {
    const [firstPath] = (urlObj.pathname || '').split('/').filter(Boolean);
    return firstPath || null;
  }
  if (host.includes('youtube.com')) {
    if (urlObj.pathname === '/watch') {
      return urlObj.searchParams.get('v');
    }
    const parts = (urlObj.pathname || '').split('/').filter(Boolean);
    if (parts[0] === 'shorts' || parts[0] === 'embed') {
      return parts[1] || null;
    }
  }
  return null;
}

function inferMusicSource(urlObj) {
  const host = urlObj.hostname.toLowerCase();
  if (host.includes('spotify')) return 'spotify';
  if (host.includes('youtube') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('soundcloud')) return 'soundcloud';
  if (host.includes('bandcamp')) return 'bandcamp';
  if (host.includes('mixcloud')) return 'mixcloud';
  return 'direct';
}

function sourceLabel(source) {
  if (source === 'spotify') return 'Spotify';
  if (source === 'youtube') return 'YouTube';
  if (source === 'soundcloud') return 'SoundCloud';
  if (source === 'bandcamp') return 'Bandcamp';
  if (source === 'mixcloud') return 'Mixcloud';
  return 'Audio Link';
}

function createVoiceMusicTrack({ url, title, requestedByUserId, requestedByName, coverUrl, durationSec }) {
  let parsed;
  try {
    parsed = new URL(String(url || '').trim());
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return null;

  const source = inferMusicSource(parsed);
  const normalizedTitle = normalizeLabel(title, inferTrackTitle(parsed));
  const normalizedCover = normalizeLabel(coverUrl, '', 500);
  const normalizedDuration = Number.isFinite(Number(durationSec)) ? clampMusicSeconds(durationSec) : null;
  const youtubeId = extractYouTubeVideoId(parsed);
  const inferredCover = normalizedCover
    || (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null);

  return {
    id: uuidv4(),
    url: parsed.toString(),
    title: normalizedTitle,
    source,
    source_label: sourceLabel(source),
    cover_url: inferredCover,
    duration_sec: normalizedDuration,
    requested_by_user_id: requestedByUserId,
    requested_by_name: normalizeLabel(requestedByName, 'Member', 80),
    added_at_ms: Date.now(),
  };
}

function createVoiceMusicSession(channelId, serverId) {
  return {
    channelId,
    serverId,
    queue: [],
    currentIndex: -1,
    playbackState: 'idle',
    basePositionSec: 0,
    stateAnchorMs: Date.now(),
    updatedAtMs: Date.now(),
    updatedByUserId: null,
  };
}

function getOrCreateVoiceMusicSession(channelId, serverId) {
  const existing = voiceMusicSessions.get(channelId);
  if (existing) {
    if (!existing.serverId && serverId) existing.serverId = serverId;
    return existing;
  }
  const created = createVoiceMusicSession(channelId, serverId);
  voiceMusicSessions.set(channelId, created);
  return created;
}

function getVoiceMusicPositionSec(session, nowMs = Date.now()) {
  const base = clampMusicSeconds(session?.basePositionSec);
  if (!session || session.playbackState !== 'playing') return base;
  const deltaSec = Math.max(0, (nowMs - Number(session.stateAnchorMs || nowMs)) / 1000);
  return clampMusicSeconds(base + deltaSec);
}

function currentVoiceMusicTrack(session) {
  if (!session || !Array.isArray(session.queue)) return null;
  if (!Number.isInteger(session.currentIndex) || session.currentIndex < 0) return null;
  return session.queue[session.currentIndex] || null;
}

function toVoiceMusicSnapshot(channelId) {
  const session = voiceMusicSessions.get(channelId);
  const nowMs = Date.now();
  if (!session) {
    return {
      channelId,
      queue: [],
      currentIndex: -1,
      currentTrackId: null,
      currentTrack: null,
      playbackState: 'idle',
      positionSec: 0,
      serverNowMs: nowMs,
      updatedAtMs: nowMs,
      updatedByUserId: null,
    };
  }

  const positionSec = getVoiceMusicPositionSec(session, nowMs);
  const currentTrack = currentVoiceMusicTrack(session);

  return {
    channelId,
    queue: session.queue,
    currentIndex: session.currentIndex,
    currentTrackId: currentTrack?.id || null,
    currentTrack,
    playbackState: session.playbackState,
    positionSec,
    serverNowMs: nowMs,
    updatedAtMs: session.updatedAtMs,
    updatedByUserId: session.updatedByUserId,
  };
}

function emitVoiceMusicState(io, channelId) {
  const payload = toVoiceMusicSnapshot(channelId);
  io.to(`voice:${channelId}`).emit('voice:music:state', payload);

  const serverId = voiceChannelServerMap.get(channelId) || voiceMusicSessions.get(channelId)?.serverId;
  if (serverId) {
    io.to(`server:${serverId}`).emit('voice:music:state', payload);
  }
}

function markVoiceMusicUpdated(session, userId, nowMs = Date.now()) {
  session.updatedAtMs = nowMs;
  session.updatedByUserId = userId || null;
}

function moveVoiceMusicTrack(session, targetIndex, userId, nowMs = Date.now()) {
  if (!Array.isArray(session.queue) || session.queue.length === 0) {
    session.currentIndex = -1;
    session.playbackState = 'idle';
    session.basePositionSec = 0;
    session.stateAnchorMs = nowMs;
    markVoiceMusicUpdated(session, userId, nowMs);
    return false;
  }

  const bounded = Math.max(0, Math.min(session.queue.length - 1, targetIndex));
  session.currentIndex = bounded;
  session.basePositionSec = 0;
  session.stateAnchorMs = nowMs;
  if (session.playbackState === 'idle') {
    session.playbackState = 'paused';
  }
  markVoiceMusicUpdated(session, userId, nowMs);
  return true;
}

function setVoiceMusicPlaybackState(session, playbackState, userId, nowMs = Date.now()) {
  const nextState = ['playing', 'paused', 'idle'].includes(playbackState) ? playbackState : 'idle';
  const currentPos = getVoiceMusicPositionSec(session, nowMs);

  if (nextState === 'idle' || !currentVoiceMusicTrack(session)) {
    session.playbackState = 'idle';
    session.basePositionSec = 0;
    session.stateAnchorMs = nowMs;
    markVoiceMusicUpdated(session, userId, nowMs);
    return;
  }

  session.playbackState = nextState;
  session.basePositionSec = currentPos;
  session.stateAnchorMs = nowMs;
  markVoiceMusicUpdated(session, userId, nowMs);
}

function resolveVoiceChannelForUser(channelId, userId) {
  if (!channelId || !userId) return null;
  const channel = getDb().prepare(
    'SELECT id, server_id, type FROM channels WHERE id = ?'
  ).get(channelId);
  if (!channel || channel.type !== 'voice') return null;

  const member = getDb().prepare(
    'SELECT id FROM server_members WHERE server_id = ? AND user_id = ?'
  ).get(channel.server_id, userId);
  if (!member) return null;

  return channel;
}

function canControlVoiceMusic(io, channel, userId) {
  if (!channel || !userId) return false;
  const server = getDb().prepare('SELECT owner_id FROM servers WHERE id = ?').get(channel.server_id);
  if (server?.owner_id === userId) return true;
  return hasUserInVoiceRoom(io, channel.id, userId);
}

function loadUserMusicLabel(userId) {
  const user = getDb().prepare('SELECT display_name, username FROM users WHERE id = ?').get(userId);
  return normalizeLabel(user?.display_name || user?.username, 'Member', 80);
}

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
  let becameEmpty = false;
  if (members && !hasUserInVoiceRoom(io, channelId, userId)) {
    members.delete(userId);
    if (members.size === 0) {
      voiceChannelMembers.delete(channelId);
      becameEmpty = true;
    }
  }

  emitVoiceState(io, channelId);

  if (becameEmpty) {
    voiceMusicSessions.delete(channelId);
    emitVoiceMusicState(io, channelId);
    voiceChannelServerMap.delete(channelId);
  }
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
        emitVoiceMusicState(io, channelId);
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
      emitVoiceMusicState(io, channelId);
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
      socket.emit('voice:music:state', toVoiceMusicSnapshot(channelId));
    });

    socket.on('voice:signal', (data) => {
      const { channelId, targetUserId, signal } = data;
      if (!channelId || !targetUserId || !signal || targetUserId === userId) return;
      if (socketVoiceChannel.get(socket.id) !== channelId) return;

      const members = voiceChannelMembers.get(channelId);
      if (!members || !members.has(targetUserId)) return;

      io.to(`user:${targetUserId}`).emit('voice:signal', { channelId, fromUserId: userId, signal });
    });

    const withVoiceMusicControl = (rawChannelId, mutator) => {
      const channelId = String(rawChannelId || '').trim();
      if (!channelId) return false;

      const channel = resolveVoiceChannelForUser(channelId, userId);
      if (!channel) return false;
      voiceChannelServerMap.set(channel.id, channel.server_id);

      if (!canControlVoiceMusic(io, channel, userId)) {
        socket.emit('voice:music:error', {
          channelId: channel.id,
          message: 'You need voice channel rights to control shared music.',
        });
        return false;
      }

      const session = getOrCreateVoiceMusicSession(channel.id, channel.server_id);
      const changed = Boolean(mutator(session, channel));
      if (changed) {
        emitVoiceMusicState(io, channel.id);
      }
      return changed;
    };

    socket.on('voice:music:state:request', (data) => {
      const channelId = String(data?.channelId || '').trim();
      if (!channelId) return;

      const channel = resolveVoiceChannelForUser(channelId, userId);
      if (!channel) return;
      voiceChannelServerMap.set(channel.id, channel.server_id);

      socket.emit('voice:music:state', toVoiceMusicSnapshot(channel.id));
    });

    socket.on('voice:music:enqueue', (data) => {
      const channelId = data?.channelId;
      const inputUrl = String(data?.url || '').trim();
      if (!inputUrl) return;

      withVoiceMusicControl(channelId, (session) => {
        if (session.queue.length >= MAX_VOICE_MUSIC_QUEUE) {
          socket.emit('voice:music:error', {
            channelId: String(channelId || ''),
            message: `Queue limit reached (${MAX_VOICE_MUSIC_QUEUE} tracks).`,
          });
          return false;
        }

        const track = createVoiceMusicTrack({
          url: inputUrl,
          title: data?.title,
          coverUrl: data?.coverUrl,
          durationSec: data?.durationSec,
          requestedByUserId: userId,
          requestedByName: loadUserMusicLabel(userId),
        });

        if (!track) {
          socket.emit('voice:music:error', {
            channelId: String(channelId || ''),
            message: 'Only valid http(s) music links can be queued.',
          });
          return false;
        }

        session.queue.push(track);
        const nowMs = Date.now();
        if (session.currentIndex < 0) {
          session.currentIndex = 0;
          session.playbackState = 'paused';
          session.basePositionSec = 0;
          session.stateAnchorMs = nowMs;
        }
        markVoiceMusicUpdated(session, userId, nowMs);
        return true;
      });
    });

    socket.on('voice:music:play', (data) => {
      withVoiceMusicControl(data?.channelId, (session, channel) => {
        if (!currentVoiceMusicTrack(session)) {
          socket.emit('voice:music:error', {
            channelId: channel.id,
            message: 'Queue is empty.',
          });
          return false;
        }
        if (session.playbackState === 'playing') return false;
        setVoiceMusicPlaybackState(session, 'playing', userId, Date.now());
        return true;
      });
    });

    socket.on('voice:music:pause', (data) => {
      withVoiceMusicControl(data?.channelId, (session) => {
        if (session.playbackState !== 'playing') return false;
        setVoiceMusicPlaybackState(session, 'paused', userId, Date.now());
        return true;
      });
    });

    socket.on('voice:music:seek', (data) => {
      withVoiceMusicControl(data?.channelId, (session, channel) => {
        if (!currentVoiceMusicTrack(session)) {
          socket.emit('voice:music:error', {
            channelId: channel.id,
            message: 'No active track to seek.',
          });
          return false;
        }
        const nowMs = Date.now();
        session.basePositionSec = clampMusicSeconds(data?.positionSec);
        session.stateAnchorMs = nowMs;
        if (session.playbackState === 'idle') {
          session.playbackState = 'paused';
        }
        markVoiceMusicUpdated(session, userId, nowMs);
        return true;
      });
    });

    socket.on('voice:music:next', (data) => {
      withVoiceMusicControl(data?.channelId, (session) => {
        if (session.queue.length === 0) return false;
        const nowMs = Date.now();
        if (session.currentIndex + 1 < session.queue.length) {
          moveVoiceMusicTrack(session, session.currentIndex + 1, userId, nowMs);
          return true;
        }
        session.currentIndex = Math.max(0, session.currentIndex);
        session.playbackState = 'idle';
        session.basePositionSec = 0;
        session.stateAnchorMs = nowMs;
        markVoiceMusicUpdated(session, userId, nowMs);
        return true;
      });
    });

    socket.on('voice:music:previous', (data) => {
      withVoiceMusicControl(data?.channelId, (session) => {
        if (session.queue.length === 0 || session.currentIndex < 0) return false;
        const nowMs = Date.now();
        const currentPos = getVoiceMusicPositionSec(session, nowMs);

        if (currentPos > 5 || session.currentIndex === 0) {
          session.basePositionSec = 0;
          session.stateAnchorMs = nowMs;
          if (session.playbackState === 'idle') session.playbackState = 'paused';
          markVoiceMusicUpdated(session, userId, nowMs);
          return true;
        }

        moveVoiceMusicTrack(session, session.currentIndex - 1, userId, nowMs);
        return true;
      });
    });

    socket.on('voice:music:set-current', (data) => {
      const targetTrackId = String(data?.trackId || '').trim();
      if (!targetTrackId) return;

      withVoiceMusicControl(data?.channelId, (session, channel) => {
        const index = session.queue.findIndex((track) => track.id === targetTrackId);
        if (index < 0) {
          socket.emit('voice:music:error', {
            channelId: channel.id,
            message: 'Track was not found in queue.',
          });
          return false;
        }

        moveVoiceMusicTrack(session, index, userId, Date.now());
        return true;
      });
    });

    socket.on('voice:music:remove', (data) => {
      const targetTrackId = String(data?.trackId || '').trim();
      if (!targetTrackId) return;

      withVoiceMusicControl(data?.channelId, (session, channel) => {
        const index = session.queue.findIndex((track) => track.id === targetTrackId);
        if (index < 0) {
          socket.emit('voice:music:error', {
            channelId: channel.id,
            message: 'Track was not found in queue.',
          });
          return false;
        }

        const nowMs = Date.now();
        session.queue.splice(index, 1);

        if (session.queue.length === 0) {
          session.currentIndex = -1;
          session.playbackState = 'idle';
          session.basePositionSec = 0;
          session.stateAnchorMs = nowMs;
          markVoiceMusicUpdated(session, userId, nowMs);
          return true;
        }

        if (index < session.currentIndex) {
          session.currentIndex -= 1;
        } else if (index === session.currentIndex) {
          session.currentIndex = Math.min(session.currentIndex, session.queue.length - 1);
          session.basePositionSec = 0;
          session.stateAnchorMs = nowMs;
          if (session.playbackState === 'idle') session.playbackState = 'paused';
        }

        markVoiceMusicUpdated(session, userId, nowMs);
        return true;
      });
    });

    socket.on('voice:music:clear', (data) => {
      withVoiceMusicControl(data?.channelId, (session) => {
        const nowMs = Date.now();
        session.queue = [];
        session.currentIndex = -1;
        session.playbackState = 'idle';
        session.basePositionSec = 0;
        session.stateAnchorMs = nowMs;
        markVoiceMusicUpdated(session, userId, nowMs);
        return true;
      });
    });

    socket.on('voice:music:track:duration', (data) => {
      const channelId = String(data?.channelId || '').trim();
      const trackId = String(data?.trackId || '').trim();
      const durationSec = Number(data?.durationSec);
      if (!channelId || !trackId || !Number.isFinite(durationSec) || durationSec <= 0) return;

      const channel = resolveVoiceChannelForUser(channelId, userId);
      if (!channel) return;
      if (!hasUserInVoiceRoom(io, channel.id, userId)) return;

      const session = voiceMusicSessions.get(channel.id);
      if (!session) return;

      const targetTrack = session.queue.find((track) => track.id === trackId);
      if (!targetTrack) return;

      const normalizedDuration = clampMusicSeconds(durationSec);
      if (targetTrack.duration_sec === normalizedDuration) return;
      targetTrack.duration_sec = normalizedDuration;
      markVoiceMusicUpdated(session, userId, Date.now());
      emitVoiceMusicState(io, channel.id);
    });

    socket.on('voice:music:track:ended', (data) => {
      const channelId = String(data?.channelId || '').trim();
      const trackId = String(data?.trackId || '').trim();
      if (!channelId || !trackId) return;

      const channel = resolveVoiceChannelForUser(channelId, userId);
      if (!channel) return;
      if (!hasUserInVoiceRoom(io, channel.id, userId)) return;

      const session = voiceMusicSessions.get(channel.id);
      if (!session) return;

      const activeTrack = currentVoiceMusicTrack(session);
      if (!activeTrack || activeTrack.id !== trackId) return;

      const nowMs = Date.now();
      if (session.currentIndex + 1 < session.queue.length) {
        moveVoiceMusicTrack(session, session.currentIndex + 1, userId, nowMs);
      } else {
        session.playbackState = 'idle';
        session.basePositionSec = 0;
        session.stateAnchorMs = nowMs;
        markVoiceMusicUpdated(session, userId, nowMs);
      }

      emitVoiceMusicState(io, channel.id);
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
