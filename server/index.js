const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { initDatabase } = require('./database/init');

let _httpServer = null;

async function startServer(portOverride) {
  if (_httpServer) {
    throw new Error('Server is already running');
  }

  await initDatabase();

  const { getDb } = require('./database/init');
  getDb().prepare('UPDATE users SET status = ?').run('offline');

  const path = require('path');
  const fs = require('fs');
  const authRoutes = require('./routes/auth');
  const friendRoutes = require('./routes/friends');
  const serverRoutes = require('./routes/servers');
  const messageRoutes = require('./routes/messages');
  const channelContentRoutes = require('./routes/channelContent');
  const uploadRoutes = require('./routes/uploads');
  const { setupWebSocket } = require('./websocket/handler');

  const app = express();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });
  app.set('io', io);

  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', authRoutes);
  app.use('/api/friends', friendRoutes);
  app.use('/api/servers', serverRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/channel-content', channelContentRoutes);
  app.use('/api/uploads', uploadRoutes);

  // Serve uploaded files as static assets
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', name: 'NoVoice Server', version: '1.0.0' });
  });

  setupWebSocket(io);

  const PORT = portOverride || process.env.PORT || 3001;

  await new Promise((resolve, reject) => {
    httpServer.listen(PORT, '0.0.0.0', (err) => {
      if (err) return reject(err);
      console.log(`\n  ✦ NoVoice Server running on port ${PORT}\n`);
      resolve();
    });
  });

  _httpServer = httpServer;
  return httpServer;
}

async function stopServer() {
  if (!_httpServer) return;
  await new Promise((resolve) => _httpServer.close(resolve));
  _httpServer = null;
}

// Auto-start when executed directly (node server/index.js)
if (require.main === module) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { startServer, stopServer };
