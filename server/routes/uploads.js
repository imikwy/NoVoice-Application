const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIME = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
};

const MAX_SIZE = {
  image: 8 * 1024 * 1024,   // 8 MB
  video: 50 * 1024 * 1024,  // 50 MB
};

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
};

// POST /api/uploads/image  or  /api/uploads/video
// Body: { data: "<base64 or data-url>", mime: "image/png" }
router.post('/:type', authenticateToken, (req, res) => {
  const { type } = req.params;
  if (!ALLOWED_MIME[type]) {
    return res.status(400).json({ error: 'Invalid upload type. Use "image" or "video".' });
  }

  const { data, mime } = req.body;
  if (!data || !mime) {
    return res.status(400).json({ error: 'Missing "data" or "mime" in request body.' });
  }

  if (!ALLOWED_MIME[type].includes(mime)) {
    return res.status(400).json({ error: `Mime type "${mime}" is not allowed for ${type} uploads.` });
  }

  // Strip optional data-URL prefix (e.g. "data:image/png;base64,")
  const base64 = data.replace(/^data:[^;]+;base64,/, '');
  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid base64 data.' });
  }

  const maxBytes = MAX_SIZE[type];
  if (buffer.length > maxBytes) {
    return res.status(413).json({
      error: `File too large. Maximum size for ${type}s is ${maxBytes / 1024 / 1024} MB.`,
    });
  }

  const ext = MIME_EXT[mime] || 'bin';
  const filename = `${uuidv4()}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);

  try {
    fs.writeFileSync(filePath, buffer);
    res.json({ url: `/uploads/${filename}` });
  } catch (err) {
    console.error('[uploads] write error:', err);
    res.status(500).json({ error: 'Failed to save file.' });
  }
});

module.exports = router;
