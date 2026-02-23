const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'novoice-secret-key-change-in-production';

// If CENTRAL_AUTH_URL is set, this server validates JWTs by calling the central server.
// Own/self-hosted servers can accept central NoVoice accounts without sharing the JWT secret.
const CENTRAL_AUTH_URL = process.env.CENTRAL_AUTH_URL || null;

async function validateWithCentralServer(token) {
  const response = await fetch(`${CENTRAL_AUTH_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Central auth rejected token');
  const data = await response.json();
  return data.user || data;
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    if (CENTRAL_AUTH_URL) {
      // Federated: delegate token validation to central NoVoice server
      req.user = await validateWithCentralServer(token);
    } else {
      // Local JWT validation
      req.user = jwt.verify(token, JWT_SECRET);
    }
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { authenticateToken, generateToken, JWT_SECRET };
