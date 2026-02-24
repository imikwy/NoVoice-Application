import { useMemo } from 'react';

// ── Tokenizer ─────────────────────────────────────────────────────────────────
// Converts raw string into a flat token list. Each token is one of:
//   { type: 'text',       value: string }
//   { type: 'bold_tog' }                   ← ** toggles bold on/off
//   { type: 'u_open' | 'u_close' }
//   { type: 'strike_tog' }                 ← ~~ toggles strike on/off
//   { type: 'color_open', value: '#HEX' }
//   { type: 'color_close' }
//   { type: 'fs_open', value: 'sm'|'lg'|'xl' }
//   { type: 'fs_close' }
//   { type: 'codeblock', value: string }
//   { type: 'image',     value: url }
//   { type: 'video',     value: url }
//   { type: 'link',      label, url }

function tokenize(raw) {
  const tokens = [];
  let i = 0;
  let textStart = 0;

  const flushText = (end) => {
    if (textStart < end) tokens.push({ type: 'text', value: raw.slice(textStart, end) });
    textStart = end;
  };

  while (i < raw.length) {
    // Code block ``` … ```
    if (raw.startsWith('```', i)) {
      const end = raw.indexOf('```', i + 3);
      if (end !== -1) {
        flushText(i);
        const inner = raw.slice(i + 3, end).replace(/^\n/, '').replace(/\n$/, '');
        tokens.push({ type: 'codeblock', value: inner });
        i = end + 3; textStart = i; continue;
      }
    }

    // Image [img:url]
    if (raw.startsWith('[img:', i)) {
      const end = raw.indexOf(']', i + 5);
      if (end !== -1) {
        flushText(i);
        tokens.push({ type: 'image', value: raw.slice(i + 5, end) });
        i = end + 1; textStart = i; continue;
      }
    }

    // Video [vid:url]
    if (raw.startsWith('[vid:', i)) {
      const end = raw.indexOf(']', i + 5);
      if (end !== -1) {
        flushText(i);
        tokens.push({ type: 'video', value: raw.slice(i + 5, end) });
        i = end + 1; textStart = i; continue;
      }
    }

    // Bold ** (toggle)
    if (raw.startsWith('**', i)) {
      flushText(i);
      tokens.push({ type: 'bold_tog' });
      i += 2; textStart = i; continue;
    }

    // Underline <u> … </u>
    if (raw.startsWith('<u>', i)) {
      flushText(i); tokens.push({ type: 'u_open' });
      i += 3; textStart = i; continue;
    }
    if (raw.startsWith('</u>', i)) {
      flushText(i); tokens.push({ type: 'u_close' });
      i += 4; textStart = i; continue;
    }

    // Strikethrough ~~ (toggle)
    if (raw.startsWith('~~', i)) {
      flushText(i);
      tokens.push({ type: 'strike_tog' });
      i += 2; textStart = i; continue;
    }

    // Font size {fs:sm|lg|xl} … {/fs}
    if (raw.startsWith('{fs:', i)) {
      const end = raw.indexOf('}', i + 4);
      if (end !== -1) {
        flushText(i);
        tokens.push({ type: 'fs_open', value: raw.slice(i + 4, end) });
        i = end + 1; textStart = i; continue;
      }
    }
    if (raw.startsWith('{/fs}', i)) {
      flushText(i); tokens.push({ type: 'fs_close' });
      i += 5; textStart = i; continue;
    }

    // Color {c:#HEX} … {/c}
    if (raw.startsWith('{c:', i)) {
      const end = raw.indexOf('}', i + 3);
      if (end !== -1) {
        flushText(i);
        tokens.push({ type: 'color_open', value: raw.slice(i + 3, end) });
        i = end + 1; textStart = i; continue;
      }
    }
    if (raw.startsWith('{/c}', i)) {
      flushText(i); tokens.push({ type: 'color_close' });
      i += 4; textStart = i; continue;
    }

    // Link [label](url)
    if (raw[i] === '[') {
      const bracketEnd = raw.indexOf('](', i + 1);
      if (bracketEnd !== -1) {
        const parenEnd = raw.indexOf(')', bracketEnd + 2);
        if (parenEnd !== -1) {
          flushText(i);
          tokens.push({ type: 'link', label: raw.slice(i + 1, bracketEnd), url: raw.slice(bracketEnd + 2, parenEnd) });
          i = parenEnd + 1; textStart = i; continue;
        }
      }
    }

    i++;
  }

  flushText(raw.length);
  return tokens;
}

// ── Token processor ───────────────────────────────────────────────────────────
// Walks the token list, tracking current style state, and emits styled segments.

const FS_CLASS = { sm: 'text-[11px]', lg: 'text-[15px]', xl: 'text-[18px] font-medium' };

function processTokens(tokens) {
  const segments = [];
  let bold = false, underline = false, strike = false, color = null, fontSize = null;

  for (const tok of tokens) {
    switch (tok.type) {
      case 'text':
        if (tok.value) segments.push({ type: 'styled', content: tok.value, bold, underline, strike, color, fontSize });
        break;
      case 'bold_tog':   bold = !bold; break;
      case 'u_open':     underline = true; break;
      case 'u_close':    underline = false; break;
      case 'strike_tog': strike = !strike; break;
      case 'color_open': color = tok.value; break;
      case 'color_close':color = null; break;
      case 'fs_open':    fontSize = tok.value; break;
      case 'fs_close':   fontSize = null; break;
      default:
        // block-level / media tokens pass through unchanged
        segments.push(tok);
    }
  }

  return segments;
}

function parseContent(raw) {
  if (!raw || typeof raw !== 'string') return [{ type: 'styled', content: '', bold: false, underline: false, strike: false, color: null, fontSize: null }];
  return processTokens(tokenize(raw));
}

// ── Renderer ──────────────────────────────────────────────────────────────────
const BLOCK_TYPES = new Set(['codeblock', 'image', 'video']);

function renderSegment(seg, idx) {
  switch (seg.type) {
    case 'styled': {
      const { content, bold, underline, strike, color, fontSize } = seg;
      const cls = [
        bold      ? 'font-bold'       : '',
        underline ? 'underline'       : '',
        strike    ? 'line-through'    : '',
        fontSize  ? FS_CLASS[fontSize] ?? '' : '',
      ].filter(Boolean).join(' ') || undefined;
      const style = color ? { color } : undefined;
      const lines = content.split('\n');
      return lines.map((line, li) => (
        <span key={`${idx}-${li}`} className={cls} style={style}>
          {li > 0 && <br />}
          {line}
        </span>
      ));
    }

    case 'codeblock':
      return (
        <pre key={idx} className="my-1.5 bg-black/40 rounded-xl p-3 text-xs text-nv-accent font-mono overflow-x-auto whitespace-pre border border-white/[0.07] leading-relaxed">
          {seg.value}
        </pre>
      );

    case 'link':
      return (
        <a key={idx} href={seg.url} target="_blank" rel="noopener noreferrer"
          className="text-nv-accent underline underline-offset-2 hover:text-nv-accent/80 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {seg.label || seg.url}
        </a>
      );

    case 'image':
      return (
        <img key={idx} src={seg.value} alt="" loading="lazy"
          className="max-w-xs max-h-64 rounded-xl mt-1.5 mb-0.5 object-contain bg-black/20 border border-white/[0.05]"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      );

    case 'video':
      return (
        <video key={idx} src={seg.value} controls
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
  const hasBlock = segments.some((s) => BLOCK_TYPES.has(s.type));

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
