import { useMemo } from 'react';

// ── Parser ────────────────────────────────────────────────────────────────────
// Converts raw message text (with format markers) into a flat array of typed
// segments that can be rendered as React elements.
//
// Supported markers:
//   **text**          → bold
//   <u>text</u>       → underline
//   ~~text~~          → strikethrough
//   ```\ntext\n```    → code block (preserves whitespace)
//   [label](url)      → clickable link
//   {c:#HEX}text{/c}  → colored text
//   [img:url]         → inline image
//   [vid:url]         → inline video

function parseContent(raw) {
  if (!raw || typeof raw !== 'string') return [{ type: 'text', content: '' }];

  const segments = [];
  let i = 0;
  let plainStart = 0;

  const flush = (end) => {
    if (plainStart < end) {
      segments.push({ type: 'text', content: raw.slice(plainStart, end) });
    }
    plainStart = end;
  };

  while (i < raw.length) {
    // ── Code block: ```...``` (check before bold ** to avoid confusion)
    if (raw.startsWith('```', i)) {
      const endIdx = raw.indexOf('```', i + 3);
      if (endIdx !== -1) {
        flush(i);
        const inner = raw.slice(i + 3, endIdx).replace(/^\n/, '').replace(/\n$/, '');
        segments.push({ type: 'codeblock', content: inner });
        i = endIdx + 3;
        plainStart = i;
        continue;
      }
    }

    // ── Image: [img:url]
    if (raw.startsWith('[img:', i)) {
      const end = raw.indexOf(']', i + 5);
      if (end !== -1) {
        flush(i);
        segments.push({ type: 'image', url: raw.slice(i + 5, end) });
        i = end + 1;
        plainStart = i;
        continue;
      }
    }

    // ── Video: [vid:url]
    if (raw.startsWith('[vid:', i)) {
      const end = raw.indexOf(']', i + 5);
      if (end !== -1) {
        flush(i);
        segments.push({ type: 'video', url: raw.slice(i + 5, end) });
        i = end + 1;
        plainStart = i;
        continue;
      }
    }

    // ── Bold: **text**
    if (raw.startsWith('**', i)) {
      const end = raw.indexOf('**', i + 2);
      if (end !== -1) {
        flush(i);
        segments.push({ type: 'bold', content: raw.slice(i + 2, end) });
        i = end + 2;
        plainStart = i;
        continue;
      }
    }

    // ── Underline: <u>text</u>
    if (raw.startsWith('<u>', i)) {
      const end = raw.indexOf('</u>', i + 3);
      if (end !== -1) {
        flush(i);
        segments.push({ type: 'underline', content: raw.slice(i + 3, end) });
        i = end + 4;
        plainStart = i;
        continue;
      }
    }

    // ── Strikethrough: ~~text~~
    if (raw.startsWith('~~', i)) {
      const end = raw.indexOf('~~', i + 2);
      if (end !== -1) {
        flush(i);
        segments.push({ type: 'strike', content: raw.slice(i + 2, end) });
        i = end + 2;
        plainStart = i;
        continue;
      }
    }

    // ── Link: [label](url)
    if (raw[i] === '[') {
      const bracketEnd = raw.indexOf('](', i + 1);
      if (bracketEnd !== -1) {
        const parenEnd = raw.indexOf(')', bracketEnd + 2);
        if (parenEnd !== -1) {
          flush(i);
          segments.push({
            type: 'link',
            label: raw.slice(i + 1, bracketEnd),
            url: raw.slice(bracketEnd + 2, parenEnd),
          });
          i = parenEnd + 1;
          plainStart = i;
          continue;
        }
      }
    }

    // ── Color: {c:#HEX}text{/c}
    if (raw.startsWith('{c:', i)) {
      const colorEnd = raw.indexOf('}', i + 3);
      if (colorEnd !== -1) {
        const color = raw.slice(i + 3, colorEnd);
        const contentEnd = raw.indexOf('{/c}', colorEnd + 1);
        if (contentEnd !== -1) {
          flush(i);
          segments.push({ type: 'color', color, content: raw.slice(colorEnd + 1, contentEnd) });
          i = contentEnd + 4;
          plainStart = i;
          continue;
        }
      }
    }

    i++;
  }

  flush(i);
  return segments;
}

// ── Renderer ──────────────────────────────────────────────────────────────────
function renderSegment(seg, idx) {
  switch (seg.type) {
    case 'text': {
      // Preserve newlines as <br />
      const lines = seg.content.split('\n');
      return lines.map((line, li) => (
        <span key={`${idx}-${li}`}>
          {li > 0 && <br />}
          {line}
        </span>
      ));
    }

    case 'bold':
      return <strong key={idx} className="font-bold">{seg.content}</strong>;

    case 'underline':
      return <span key={idx} className="underline">{seg.content}</span>;

    case 'strike':
      return <span key={idx} className="line-through">{seg.content}</span>;

    case 'codeblock':
      return (
        <pre
          key={idx}
          className="my-1.5 bg-black/40 rounded-xl p-3 text-xs text-nv-accent font-mono overflow-x-auto whitespace-pre border border-white/[0.07] leading-relaxed"
        >
          {seg.content}
        </pre>
      );

    case 'link':
      return (
        <a
          key={idx}
          href={seg.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-nv-accent underline underline-offset-2 hover:text-nv-accent/80 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {seg.label || seg.url}
        </a>
      );

    case 'color':
      return (
        <span key={idx} style={{ color: seg.color }}>
          {seg.content}
        </span>
      );

    case 'image':
      return (
        <img
          key={idx}
          src={seg.url}
          alt=""
          loading="lazy"
          className="max-w-xs max-h-64 rounded-xl mt-1.5 mb-0.5 object-contain bg-black/20 border border-white/[0.05]"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      );

    case 'video':
      return (
        <video
          key={idx}
          src={seg.url}
          controls
          className="max-w-xs max-h-64 rounded-xl mt-1.5 mb-0.5 bg-black/40 border border-white/[0.05]"
        />
      );

    default:
      return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function MessageContent({ content }) {
  const segments = useMemo(() => parseContent(content), [content]);

  const hasBlock = segments.some((s) =>
    s.type === 'codeblock' || s.type === 'image' || s.type === 'video'
  );

  if (hasBlock) {
    return (
      <div className="text-sm text-nv-text-primary/90 leading-relaxed break-words">
        {segments.map((seg, idx) => renderSegment(seg, idx))}
      </div>
    );
  }

  return (
    <p className="text-sm text-nv-text-primary/90 break-words leading-relaxed">
      {segments.map((seg, idx) => renderSegment(seg, idx))}
    </p>
  );
}
