/**
 * App Store Registry — serves the list of approved community extensions.
 *
 * To approve an app, add its manifest entry to server/data/approved-apps.json.
 * Format per entry:
 * {
 *   "id":          "my-app",
 *   "name":        "My App",
 *   "description": "Short description",
 *   "version":     "1.0.0",
 *   "author":      "DevName",
 *   "icon":        "🎮",
 *   "iconColor":   "#FF3B30",
 *   "tags":        ["games"],
 *   "bundleUrl":   "https://github.com/.../releases/download/v1.0.0/app.bundle.js",
 *   "repository":  "https://github.com/dev/my-app"
 * }
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const REGISTRY_PATH = path.join(__dirname, '../data/approved-apps.json');

// GET /api/app-store — public, no auth required
router.get('/', (_req, res) => {
  if (!fs.existsSync(REGISTRY_PATH)) {
    return res.json([]);
  }
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
    const apps = JSON.parse(raw);
    res.json(Array.isArray(apps) ? apps : []);
  } catch {
    res.json([]);
  }
});

module.exports = router;
