/**
 * App Store Registry — serves the list of approved community extensions.
 *
 * To approve an app, add its manifest entry to server/data/approved-apps.json
 * AND to the BUILT_IN_REGISTRY array below (the array is the fallback used
 * when the JSON file is not present in the container).
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const REGISTRY_PATH = path.join(__dirname, '../data/approved-apps.json');

// ── Hardcoded fallback registry ───────────────────────────────────────────────
// Always available even if the JSON file is missing from the container.
// The JSON file (if present and valid) overrides this list at runtime.
const BUILT_IN_REGISTRY = [
  {
    id: 'snake-game',
    name: 'Snake',
    description: 'Classic Snake game with persistent high score.',
    version: '1.0.0',
    author: 'NoVoice',
    icon: '🐍',
    iconColor: '#32d74b',
    tags: ['games'],
    bundleUrl: 'https://github.com/imikwy/NoVoice-Snake/releases/download/Release/app.bundle',
    repository: 'https://github.com/imikwy/NoVoice-Snake',
  },
];

function loadRegistry() {
  if (fs.existsSync(REGISTRY_PATH)) {
    try {
      const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // fall through to built-in
    }
  }
  return BUILT_IN_REGISTRY;
}

// GET /api/app-store — public, no auth required
router.get('/', (_req, res) => {
  res.json(loadRegistry());
});

// GET /api/app-store/debug — temporary diagnostic endpoint
router.get('/debug', (_req, res) => {
  const exists = fs.existsSync(REGISTRY_PATH);
  let raw = null;
  let parsed = null;
  let parseError = null;
  if (exists) {
    try {
      raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
      parsed = JSON.parse(raw);
    } catch (err) {
      parseError = err.message;
    }
  }
  res.json({
    resolvedPath: REGISTRY_PATH,
    exists,
    raw,
    parsed,
    parseError,
    usingFallback: !exists || parsed === null,
    registry: loadRegistry(),
  });
});

module.exports = router;
