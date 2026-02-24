const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
];

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function toInt(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function parseUrlList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

router.get('/ice', authenticateToken, (req, res) => {
  const stunUrls = parseUrlList(process.env.TURN_STUN_URLS);
  const turnUrls = parseUrlList(process.env.TURN_URLS || process.env.TURN_PUBLIC_URLS);
  const turnEnabled = toBool(process.env.TURN_ENABLED, false);
  const ttlSeconds = toInt(process.env.TURN_CREDENTIAL_TTL_SECONDS, 3600, 300, 86400);

  const staticAuthSecret = String(
    process.env.TURN_STATIC_AUTH_SECRET || process.env.TURN_SECRET || ''
  ).trim();
  const staticUsername = String(process.env.TURN_USERNAME || '').trim();
  const staticPassword = String(process.env.TURN_PASSWORD || '').trim();

  const response = {
    turnEnabled: false,
    credentialType: 'none',
    ttlSeconds: null,
    expiresAt: null,
    iceServers: [
      {
        urls: stunUrls.length > 0 ? stunUrls : DEFAULT_STUN_URLS,
      },
    ],
  };

  if (!turnEnabled || turnUrls.length === 0) {
    return res.json(response);
  }

  if (staticAuthSecret) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = nowSeconds + ttlSeconds;
    const userId = String(req.user?.id || 'user');
    const username = `${expiresAt}:${userId}`;
    const credential = crypto
      .createHmac('sha1', staticAuthSecret)
      .update(username)
      .digest('base64');

    response.turnEnabled = true;
    response.credentialType = 'hmac-sha1';
    response.ttlSeconds = ttlSeconds;
    response.expiresAt = expiresAt;
    response.iceServers.push({
      urls: turnUrls,
      username,
      credential,
    });

    return res.json(response);
  }

  if (staticUsername && staticPassword) {
    response.turnEnabled = true;
    response.credentialType = 'static';
    response.iceServers.push({
      urls: turnUrls,
      username: staticUsername,
      credential: staticPassword,
    });
    return res.json(response);
  }

  response.credentialType = 'missing-turn-credentials';
  return res.json(response);
});

module.exports = router;
