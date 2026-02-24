const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `You are a task extraction assistant. Extract a structured todo list from the provided content.

Return ONLY valid JSON with this exact structure — no explanation, no markdown, no code blocks:
{
  "categories": [
    {
      "name": "Category Name",
      "tasks": [
        { "title": "Task title", "description": "Optional short detail" }
      ]
    }
  ]
}

Rules:
- Group related tasks into logical categories (e.g. "Shopping", "Work", "Home")
- If no clear grouping exists, use a single category named "Tasks"
- Keep task titles short and actionable (max ~80 chars)
- Use description only for genuinely important details, otherwise leave it empty string ""
- Do not add completed/priority/date fields
- Return only the JSON object, nothing else`;

router.post('/import-tasks', authenticateToken, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(501).json({
      error: 'AI import is not configured. Ask the server admin to set GEMINI_API_KEY in the server environment.',
    });
  }

  const { type, content, mimeType } = req.body;
  if (!type || !content) {
    return res.status(400).json({ error: 'type and content are required' });
  }
  if (!['text', 'image', 'pdf'].includes(type)) {
    return res.status(400).json({ error: 'type must be text, image, or pdf' });
  }

  try {
    let parts;
    if (type === 'text') {
      parts = [
        { text: SYSTEM_PROMPT },
        { text: `\n\nContent to extract tasks from:\n${content}` },
      ];
    } else {
      const mime = mimeType || (type === 'pdf' ? 'application/pdf' : 'image/jpeg');
      parts = [
        { text: SYSTEM_PROMPT },
        { inline_data: { mime_type: mime, data: content } },
      ];
    }

    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.error('[AI] Gemini error:', errBody);
      const detail = errBody?.error?.message || `HTTP ${response.status}`;
      return res.status(502).json({ error: 'AI service error', detail });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(502).json({ error: 'No response from AI model' });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error('[AI] Failed to parse Gemini JSON:', text);
      return res.status(502).json({ error: 'AI returned invalid JSON' });
    }

    if (!Array.isArray(parsed?.categories)) {
      return res.status(502).json({ error: 'AI response missing categories array' });
    }

    res.json(parsed);
  } catch (err) {
    console.error('[AI] import-tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
