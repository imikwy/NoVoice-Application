const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are a task extraction assistant. Extract every actionable task from the provided content.

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

CATEGORY RULES — this is critical:
- You MUST only use these five category names (exactly as written): "To Do", "In Progress", "Done", "Ideas", "Backlog"
- "To Do"      → concrete, actionable tasks that need to be done
- "In Progress" → tasks explicitly mentioned as currently being worked on
- "Done"       → tasks explicitly mentioned as already completed or finished
- "Ideas"      → vague suggestions, feature ideas, brainstorming items, or "would be nice" concepts
- "Backlog"    → lower priority tasks, future considerations, nice-to-haves
- NEVER invent your own category names
- NEVER use document headings, section titles, or any structural text from the content as category names
- Only include a category in the output if it actually has tasks
- When in doubt, default to "To Do"

TASK RULES:
- Extract every distinct action item, feature, or todo — do not skip any
- Keep task titles short and actionable (max ~80 chars)
- Use description for genuinely important detail only, otherwise use empty string ""
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
      return res.status(502).json({ error: `AI service error: ${detail}` });
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
