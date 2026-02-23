import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Smile,
  Bold,
  Underline,
  Strikethrough,
  Code2,
  Link,
  Palette,
  MoreHorizontal,
  Image as ImageIcon,
  Film,
  Video,
  X,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useApp } from '../context/AppContext';

// ── Format markers ─────────────────────────────────────────────────────────────
const MARKERS = {
  bold:   { open: '**',    close: '**'    },
  under:  { open: '<u>',   close: '</u>'  },
  strike: { open: '~~',    close: '~~'    },
  code:   { open: '```\n', close: '\n```' },
};

// ── Preset text colors ─────────────────────────────────────────────────────────
const PRESET_COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#00C7BE', '#007AFF', '#5856D6', '#FF2D55',
  '#FFFFFF', '#AEAEB2', '#636366', '#A2845E',
];

// ── Emoji data ─────────────────────────────────────────────────────────────────
const EMOJI_DATA = [
  {
    cat: '😀', name: 'Smileys',
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
  },
  {
    cat: '👋', name: 'People',
    emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💅','🤳','💪','🦵','🦶','👂','👃','🧠','🦷','🦴','👀','👁️','👅','💋','🫀','🫁','🦾','🦿','🧏','💆','💇','🚶','🧍','🧎','🏃','💃','🕺','👯','🧖','🧗','🧘','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','👮','🕵️','💂','🥷','👷','🫅','🤴','👸','🎅','🤶','🦸','🦹','🧙','🧚','🧛','🧜','🧝','🧞','🧟','🧌'],
  },
  {
    cat: '🐶', name: 'Animals',
    emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗','🕷️','🐢','🐍','🦎','🐊','🦕','🦖','🦈','🐬','🐋','🦑','🦞','🦀','🐡','🐠','🐟','🐅','🐆','🦓','🦍','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐓','🦃','🦚','🦜','🐇','🦝','🦨','🦡','🦦','🦥','🐿️','🦔'],
  },
  {
    cat: '🍎', name: 'Food',
    emojis: ['🍎','🍊','🍋','🍇','🍓','🫐','🍈','🍑','🍒','🍍','🥭','🥝','🍅','🫒','🥑','🍆','🥔','🥕','🌽','🌶️','🧄','🧅','🥜','🫘','🍞','🥐','🥖','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🌮','🌯','🥙','🧆','🥗','🥘','🫕','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🍦','🍧','🍨','☕','🍵','🧃','🥤','🧋','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊'],
  },
  {
    cat: '⚽', name: 'Activities',
    emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🏒','🥊','🥋','🎯','🎮','🕹️','🎲','♟️','🎭','🎨','🖼️','🎪','🤹','🎠','🎡','🎢','🎤','🎧','🎼','🎹','🥁','🪘','🎸','🎺','🎷','🎻','🪗','🎬','🎥','📽️','🏋️','🤸','🤺','🏇','⛷️','🏂','🪂','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🎗️','🎫','🎟️','🤼','🏄','🤿','🏌️','🏇','⛹️','🤾'],
  },
  {
    cat: '✈️', name: 'Travel',
    emojis: ['✈️','🚀','🛸','🚁','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🏎️','🚐','🚑','🚒','🚓','🚕','🚗','🚙','🛻','🚚','🚛','🚜','🛵','🏍️','🚲','🛴','🛹','🛼','⛽','🛞','🚦','🚥','🛑','🗺️','🧭','⛰️','🏔️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🏘️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕'],
  },
  {
    cat: '💡', name: 'Objects',
    emojis: ['💡','🔦','🕯️','💰','💳','💎','⚖️','🔧','🔨','⚒️','🛠️','⛏️','🔩','🪛','🔬','🔭','📡','🛒','🚪','🪞','🛏️','🛁','🧹','🧺','🧻','🧼','🧽','🪣','🏮','🧯','🛡️','⚙️','📱','💻','⌨️','🖥️','🖨️','🖱️','💾','💿','📀','📷','📸','📹','📺','📻','📞','☎️','📟','📠','⌚','⏰','⏱️','⏳','📚','📖','📰','📝','✏️','🖊️','🖋️','📌','📍','📎','📏','📐','✂️','🔒','🔓','🔑','🗝️','🪆','🧸','🪀','🪁','🎀','🎁','🛍️'],
  },
  {
    cat: '❤️', name: 'Symbols',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🛐','☯️','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🔀','🔁','🔂','▶️','⏩','◀️','⏪','🔼','🔽','⏸️','⏹️','⏺️','🎦','🔅','🔆','📶','🔔','🔇','🔈','🔉','🔊','📢','📣','❓','❗','‼️','⁉️','💯','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','⬛','⬜','▪️','▫️','🔲','🔳'],
  },
];

// ── Component ──────────────────────────────────────────────────────────────────
export default function MessageInput({ onSend, placeholder, channelId, isDM, targetId }) {
  const { socket } = useSocket();
  const { activeServerApi } = useApp();

  // Core input state
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  // Format tracking: which opening markers have been inserted but not yet closed
  const [formatOpen, setFormatOpen] = useState(new Set());
  const [activeColor, setActiveColor] = useState(null);

  // Popup visibility
  const [showEmoji, setShowEmoji] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [showGifInput, setShowGifInput] = useState(false);

  // Link dialog fields
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');

  // GIF URL input
  const [gifUrl, setGifUrl] = useState('');

  // Emoji selected category
  const [emojiCat, setEmojiCat] = useState(0);

  // Upload state
  const [uploading, setUploading] = useState(false);

  // Typing indicator
  const typingRef = useRef(false);
  const typingTimeoutRef = useRef(null);

  // Popup container refs (for close-on-outside-click)
  const emojiRef = useRef(null);
  const colorsRef = useRef(null);
  const linkRef = useRef(null);
  const mediaRef = useRef(null);

  // Hidden file inputs
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);

  // ── Auto-resize textarea ───────────────────────────────────────────────────
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [value]);

  // ── Close popups on outside click ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (showEmoji && emojiRef.current && !emojiRef.current.contains(e.target)) {
        setShowEmoji(false);
      }
      if (showColors && colorsRef.current && !colorsRef.current.contains(e.target)) {
        setShowColors(false);
      }
      if (showLinkDialog && linkRef.current && !linkRef.current.contains(e.target)) {
        setShowLinkDialog(false);
        setLinkUrl('');
        setLinkLabel('');
      }
      if (showMediaMenu && mediaRef.current && !mediaRef.current.contains(e.target)) {
        setShowMediaMenu(false);
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [showEmoji, showColors, showLinkDialog, showMediaMenu]);

  // ── Insert text at cursor position ────────────────────────────────────────
  const insertAtCursor = useCallback((text) => {
    const ta = inputRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = value.slice(0, start) + text + value.slice(end);
    setValue(newVal);
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      ta.setSelectionRange(start + text.length, start + text.length);
      ta.focus();
    });
  }, [value]);

  // ── Format button toggle ───────────────────────────────────────────────────
  // First click: inserts opening marker, marks format as "open"
  // Second click: inserts closing marker, marks format as "closed"
  const toggleFormat = useCallback((name) => {
    const m = MARKERS[name];
    if (formatOpen.has(name)) {
      insertAtCursor(m.close);
      setFormatOpen((prev) => { const n = new Set(prev); n.delete(name); return n; });
    } else {
      insertAtCursor(m.open);
      setFormatOpen((prev) => new Set([...prev, name]));
    }
  }, [formatOpen, insertAtCursor]);

  // ── Color ──────────────────────────────────────────────────────────────────
  const applyColor = useCallback((hex) => {
    // If a color is already open, close it first
    if (activeColor) {
      insertAtCursor('{/c}');
      if (hex === activeColor) {
        // Same color → just toggle off
        setActiveColor(null);
        setShowColors(false);
        return;
      }
    }
    insertAtCursor(`{c:${hex}}`);
    setActiveColor(hex);
    setShowColors(false);
  }, [activeColor, insertAtCursor]);

  const closeColor = useCallback(() => {
    if (!activeColor) return;
    insertAtCursor('{/c}');
    setActiveColor(null);
  }, [activeColor, insertAtCursor]);

  // ── Link ───────────────────────────────────────────────────────────────────
  const insertLink = useCallback(() => {
    const url = linkUrl.trim();
    if (!url) return;
    const label = linkLabel.trim() || url;
    insertAtCursor(`[${label}](${url})`);
    setLinkUrl('');
    setLinkLabel('');
    setShowLinkDialog(false);
  }, [linkUrl, linkLabel, insertAtCursor]);

  // ── Emoji ──────────────────────────────────────────────────────────────────
  const insertEmoji = useCallback((emoji) => {
    insertAtCursor(emoji);
    // Don't close picker so user can insert multiple
  }, [insertAtCursor]);

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (file, type) => {
    if (!file) return;

    const maxBytes = type === 'video' ? 50 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      alert(`File too large. Maximum size for ${type}s is ${maxBytes / 1024 / 1024} MB.`);
      return;
    }

    setUploading(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const serverBase = activeServerApi?.serverBase ?? 'http://localhost:3001';
      const resp = await fetch(`${serverBase}/api/uploads/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('nv_token')}`,
        },
        body: JSON.stringify({ data: base64, mime: file.type }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }

      const { url } = await resp.json();
      const fullUrl = `${serverBase}${url}`;
      insertAtCursor(type === 'video' ? `[vid:${fullUrl}]` : `[img:${fullUrl}]`);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }, [activeServerApi, insertAtCursor]);

  // ── GIF URL insert ─────────────────────────────────────────────────────────
  const confirmGif = useCallback(() => {
    const url = gifUrl.trim();
    if (url) insertAtCursor(`[img:${url}]`);
    setGifUrl('');
    setShowGifInput(false);
  }, [gifUrl, insertAtCursor]);

  // ── Typing indicator ───────────────────────────────────────────────────────
  const handleTyping = useCallback(() => {
    if (!socket || !channelId) return;
    if (!typingRef.current) {
      typingRef.current = true;
      socket.emit('typing:start', { channelId, isDM, targetId });
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      typingRef.current = false;
      socket.emit('typing:stop', { channelId, isDM, targetId });
    }, 2000);
  }, [socket, channelId, isDM, targetId]);

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (!value.trim()) return;

    // Auto-close any unclosed format markers before sending
    let finalValue = value;
    if (formatOpen.has('code'))   finalValue += '\n```';
    if (formatOpen.has('bold'))   finalValue += '**';
    if (formatOpen.has('under'))  finalValue += '</u>';
    if (formatOpen.has('strike')) finalValue += '~~';
    if (activeColor)              finalValue += '{/c}';

    onSend(finalValue.trim());
    setValue('');
    setFormatOpen(new Set());
    setActiveColor(null);

    typingRef.current = false;
    clearTimeout(typingTimeoutRef.current);
    socket?.emit('typing:stop', { channelId, isDM, targetId });

    inputRef.current?.focus();
  }, [value, formatOpen, activeColor, onSend, socket, channelId, isDM, targetId]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasContent = value.trim().length > 0;

  // ── Format button config ───────────────────────────────────────────────────
  const formatButtons = [
    { key: 'bold',   Icon: Bold,          title: 'Bold — **text**'         },
    { key: 'under',  Icon: Underline,      title: 'Underline — <u>text</u>' },
    { key: 'strike', Icon: Strikethrough,  title: 'Strikethrough — ~~text~~'},
    { key: 'code',   Icon: Code2,          title: 'Code block — ```text```' },
  ];

  return (
    <div className="px-4 pb-4 pt-1.5">
      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { handleFileUpload(e.target.files[0], 'image'); e.target.value = ''; }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => { handleFileUpload(e.target.files[0], 'video'); e.target.value = ''; }}
      />

      <div className="flex flex-col bg-nv-surface/40 rounded-xl border border-nv-border/30 focus-within:border-nv-accent/30 focus-within:ring-1 focus-within:ring-nv-accent/15 transition-all duration-200 relative">

        {/* GIF URL inline input (slides in above toolbar) */}
        <AnimatePresence>
          {showGifInput && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-3 pt-2.5 pb-2 border-b border-white/[0.06] flex items-center gap-2">
                <Film size={13} className="text-nv-text-tertiary shrink-0" />
                <input
                  type="url"
                  value={gifUrl}
                  onChange={(e) => setGifUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmGif();
                    if (e.key === 'Escape') { setShowGifInput(false); setGifUrl(''); }
                  }}
                  placeholder="Paste GIF URL and press Enter…"
                  autoFocus
                  className="flex-1 bg-transparent text-xs text-nv-text-primary placeholder-nv-text-tertiary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => { setShowGifInput(false); setGifUrl(''); }}
                  className="text-nv-text-tertiary hover:text-nv-text-primary transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Textarea */}
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            handleTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={uploading}
          className="bg-transparent text-sm text-nv-text-primary placeholder-nv-text-tertiary resize-none focus:outline-none leading-relaxed px-3 pt-2.5 pb-1.5 w-full disabled:opacity-50"
          style={{ minHeight: '38px', maxHeight: '160px' }}
        />

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5 pt-0.5 border-t border-white/[0.04]">

          {/* Format buttons (B, U, S, Code) */}
          {formatButtons.map(({ key, Icon, title }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleFormat(key)}
              title={title}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                formatOpen.has(key)
                  ? 'bg-nv-accent/20 text-nv-accent'
                  : 'text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06]'
              }`}
            >
              <Icon size={13} />
            </button>
          ))}

          {/* Divider */}
          <div className="w-px h-4 bg-white/[0.08] mx-0.5" />

          {/* Link button + dialog */}
          <div className="relative" ref={linkRef}>
            <button
              type="button"
              onClick={() => {
                setShowEmoji(false);
                setShowColors(false);
                setShowMediaMenu(false);
                setShowLinkDialog((p) => !p);
              }}
              title="Insert link — [Label](url)"
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                showLinkDialog
                  ? 'bg-nv-accent/20 text-nv-accent'
                  : 'text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06]'
              }`}
            >
              <Link size={13} />
            </button>

            <AnimatePresence>
              {showLinkDialog && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full left-0 mb-2 w-60 z-50 rounded-2xl bg-nv-channels border border-white/[0.08] shadow-2xl p-3"
                >
                  <p className="text-[10px] text-nv-text-tertiary uppercase tracking-wide mb-2">
                    Insert Link
                  </p>
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://example.com"
                    autoFocus
                    className="w-full bg-black/30 rounded-lg px-2.5 py-1.5 text-xs text-nv-text-primary placeholder-nv-text-tertiary border border-white/[0.06] focus:outline-none focus:border-nv-accent/40 mb-1.5"
                  />
                  <input
                    type="text"
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && insertLink()}
                    placeholder="Label (optional)"
                    className="w-full bg-black/30 rounded-lg px-2.5 py-1.5 text-xs text-nv-text-primary placeholder-nv-text-tertiary border border-white/[0.06] focus:outline-none focus:border-nv-accent/40 mb-2"
                  />
                  <button
                    type="button"
                    onClick={insertLink}
                    className="w-full py-1.5 rounded-lg text-xs font-medium bg-nv-accent/20 text-nv-accent hover:bg-nv-accent/30 transition-colors"
                  >
                    Insert
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Color picker button */}
          <div className="relative" ref={colorsRef}>
            <button
              type="button"
              onClick={() => {
                if (activeColor) {
                  closeColor();
                } else {
                  setShowEmoji(false);
                  setShowLinkDialog(false);
                  setShowMediaMenu(false);
                  setShowColors((p) => !p);
                }
              }}
              title={activeColor ? 'Close color' : 'Text color'}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                activeColor || showColors
                  ? 'bg-nv-accent/20'
                  : 'text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06]'
              }`}
              style={activeColor ? { color: activeColor } : {}}
            >
              <Palette size={13} />
            </button>

            <AnimatePresence>
              {showColors && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full left-0 mb-2 z-50 rounded-2xl bg-nv-channels border border-white/[0.08] shadow-2xl p-3"
                >
                  <p className="text-[10px] text-nv-text-tertiary uppercase tracking-wide mb-2">
                    Text Color
                  </p>
                  <div className="grid grid-cols-6 gap-1.5">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => applyColor(color)}
                        title={color}
                        className={`w-6 h-6 rounded-full transition-all hover:scale-110 border-2 ${
                          activeColor === color ? 'border-white/80 scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Emoji picker button */}
          <div className="relative" ref={emojiRef}>
            <button
              type="button"
              onClick={() => {
                setShowColors(false);
                setShowLinkDialog(false);
                setShowMediaMenu(false);
                setShowEmoji((p) => !p);
              }}
              title="Emoji"
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                showEmoji
                  ? 'bg-nv-accent/20 text-nv-accent'
                  : 'text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06]'
              }`}
            >
              <Smile size={13} />
            </button>

            <AnimatePresence>
              {showEmoji && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full right-0 mb-2 w-72 z-50 rounded-2xl bg-nv-channels border border-white/[0.08] shadow-2xl overflow-hidden"
                >
                  {/* Category tabs */}
                  <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/[0.06] overflow-x-auto scrollbar-hide">
                    {EMOJI_DATA.map((cat, ci) => (
                      <button
                        key={ci}
                        type="button"
                        onClick={() => setEmojiCat(ci)}
                        title={cat.name}
                        className={`text-base px-1.5 py-0.5 rounded-lg shrink-0 transition-colors ${
                          emojiCat === ci ? 'bg-nv-accent/20' : 'hover:bg-white/[0.06]'
                        }`}
                      >
                        {cat.cat}
                      </button>
                    ))}
                  </div>

                  {/* Category name */}
                  <p className="text-[10px] text-nv-text-tertiary uppercase tracking-wide px-3 pt-2 pb-1">
                    {EMOJI_DATA[emojiCat]?.name}
                  </p>

                  {/* Emoji grid */}
                  <div className="px-2 pb-2 h-44 overflow-y-auto">
                    <div className="grid grid-cols-9 gap-0.5">
                      {EMOJI_DATA[emojiCat]?.emojis.map((emoji, ei) => (
                        <button
                          key={ei}
                          type="button"
                          onClick={() => insertEmoji(emoji)}
                          className="text-xl p-1 rounded-lg hover:bg-white/[0.08] transition-colors flex items-center justify-center leading-none"
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Media menu (⋯) */}
          <div className="relative" ref={mediaRef}>
            <button
              type="button"
              onClick={() => {
                setShowEmoji(false);
                setShowColors(false);
                setShowLinkDialog(false);
                setShowMediaMenu((p) => !p);
              }}
              title="Attach media"
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                showMediaMenu
                  ? 'bg-nv-accent/20 text-nv-accent'
                  : 'text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06]'
              }`}
            >
              <MoreHorizontal size={13} />
            </button>

            <AnimatePresence>
              {showMediaMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full right-0 mb-2 z-50 w-40 rounded-2xl bg-nv-channels border border-white/[0.08] shadow-2xl overflow-hidden"
                >
                  {[
                    {
                      label: 'Image',
                      icon: <ImageIcon size={13} />,
                      action: () => { imageInputRef.current?.click(); setShowMediaMenu(false); },
                      sub: 'JPG, PNG, WebP (max 8 MB)',
                    },
                    {
                      label: 'GIF',
                      icon: <Film size={13} />,
                      action: () => { setShowGifInput(true); setShowMediaMenu(false); },
                      sub: 'Paste a GIF URL',
                    },
                    {
                      label: 'Video',
                      icon: <Video size={13} />,
                      action: () => { videoInputRef.current?.click(); setShowMediaMenu(false); },
                      sub: 'MP4, WebM (max 50 MB)',
                    },
                  ].map(({ label, icon, action, sub }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={action}
                      className="w-full flex items-start gap-2.5 px-3.5 py-2.5 hover:bg-white/[0.06] transition-colors text-left"
                    >
                      <span className="text-nv-text-tertiary mt-0.5 shrink-0">{icon}</span>
                      <span>
                        <span className="block text-sm text-nv-text-primary">{label}</span>
                        <span className="block text-[10px] text-nv-text-tertiary mt-0.5">{sub}</span>
                      </span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Send button */}
          <motion.button
            type="button"
            onClick={handleSubmit}
            disabled={!hasContent || uploading}
            whileTap={{ scale: 0.9 }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-nv-accent disabled:text-nv-text-tertiary disabled:opacity-40 hover:bg-nv-accent/10 transition-all ml-0.5 shrink-0"
            title="Send (Enter)"
          >
            <Send size={14} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
