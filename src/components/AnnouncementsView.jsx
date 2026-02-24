import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Megaphone, Plus, Trash2, X, Send, Bold, Underline, Strikethrough, Code2, Palette, CaseSensitive } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import MessageContent from './MessageContent';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTimestamp(iso) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ── Mini format toolbar (same markers as MessageInput) ────────────────────────
const MARKERS = {
  bold:   { open: '**',    close: '**'    },
  under:  { open: '<u>',   close: '</u>'  },
  strike: { open: '~~',    close: '~~'    },
  code:   { open: '```\n', close: '\n```' },
};
const PRESET_COLORS = [
  '#FF3B30','#FF9500','#FFCC00','#34C759',
  '#00C7BE','#007AFF','#5856D6','#FF2D55',
  '#FFFFFF','#AEAEB2','#636366','#A2845E',
];
const FONT_SIZES = [
  { id: 'xl', label: 'Huge',   cls: 'text-xl font-semibold' },
  { id: 'lg', label: 'Large',  cls: 'text-base font-medium' },
  { id: 'md', label: 'Normal', cls: 'text-sm' },
  { id: 'sm', label: 'Small',  cls: 'text-[11px]' },
];

function MiniFormatBar({ textareaRef, value, setValue }) {
  const [formatOpen, setFormatOpen]   = useState(new Set());
  const [activeColor, setActiveColor] = useState(null);
  const [activeSize,  setActiveSize]  = useState(null);
  const [showColors,  setShowColors]  = useState(false);
  const [showSizes,   setShowSizes]   = useState(false);
  const colorRef = useRef(null);
  const sizeRef  = useRef(null);

  // close popups on outside click
  useEffect(() => {
    const h = (e) => {
      if (showColors && colorRef.current && !colorRef.current.contains(e.target)) setShowColors(false);
      if (showSizes  && sizeRef.current  && !sizeRef.current.contains(e.target))  setShowSizes(false);
    };
    document.addEventListener('mousedown', h, true);
    return () => document.removeEventListener('mousedown', h, true);
  }, [showColors, showSizes]);

  const insertAt = useCallback((text) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const next = value.slice(0, s) + text + value.slice(e);
    setValue(next);
    requestAnimationFrame(() => {
      ta.setSelectionRange(s + text.length, s + text.length);
      ta.focus();
    });
  }, [value, setValue, textareaRef]);

  const toggleFmt = (name) => {
    const m = MARKERS[name];
    if (formatOpen.has(name)) {
      insertAt(m.close);
      setFormatOpen(prev => { const n = new Set(prev); n.delete(name); return n; });
    } else {
      insertAt(m.open);
      setFormatOpen(prev => new Set([...prev, name]));
    }
  };

  const applyColor = (hex) => {
    if (activeColor) { insertAt('{/c}'); if (hex === activeColor) { setActiveColor(null); setShowColors(false); return; } }
    insertAt(`{c:${hex}}`); setActiveColor(hex); setShowColors(false);
  };

  const applySize = (id) => {
    if (activeSize) { insertAt('{/fs}'); if (id === activeSize || id === 'md') { setActiveSize(null); setShowSizes(false); return; } }
    if (id !== 'md') { insertAt(`{fs:${id}}`); setActiveSize(id); } else { setActiveSize(null); }
    setShowSizes(false);
  };

  const btnCls = (active) =>
    `w-6 h-6 rounded-md flex items-center justify-center transition-all text-[11px] ${
      active ? 'bg-nv-accent/20 text-nv-accent' : 'text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06]'
    }`;

  return (
    <div className="flex items-center gap-0.5 px-1 pb-1 pt-0.5 border-t border-white/[0.04]">
      {[
        { key: 'bold',   Icon: Bold,         title: 'Bold' },
        { key: 'under',  Icon: Underline,     title: 'Underline' },
        { key: 'strike', Icon: Strikethrough, title: 'Strikethrough' },
        { key: 'code',   Icon: Code2,         title: 'Code' },
      ].map(({ key, Icon, title }) => (
        <button key={key} type="button" title={title} onClick={() => toggleFmt(key)} className={btnCls(formatOpen.has(key))}>
          <Icon size={11} />
        </button>
      ))}

      <div className="w-px h-3 bg-white/[0.08] mx-0.5" />

      {/* Color */}
      <div className="relative" ref={colorRef}>
        <button type="button" title="Text color" onClick={() => setShowColors(p => !p)}
          className={btnCls(!!activeColor || showColors)}
          style={activeColor ? { color: activeColor } : {}}
        >
          <Palette size={11} />
        </button>
        <AnimatePresence>
          {showColors && (
            <motion.div initial={{ opacity:0,y:4,scale:0.96 }} animate={{ opacity:1,y:0,scale:1 }} exit={{ opacity:0,y:4,scale:0.96 }}
              transition={{ duration:0.1 }}
              className="absolute bottom-full left-0 mb-1.5 z-50 rounded-xl bg-nv-channels border border-white/[0.08] shadow-2xl p-2 flex flex-col gap-1.5"
            >
              <div className="flex gap-1.5">{PRESET_COLORS.slice(0,8).map(c=>(
                <button key={c} type="button" onClick={()=>applyColor(c)}
                  className="w-4 h-4 rounded-full hover:scale-110 transition-all shrink-0"
                  style={{ backgroundColor:c, outline: activeColor===c?`2px solid ${c}`:'2px solid transparent', outlineOffset:'2px' }}
                />
              ))}</div>
              <div className="flex gap-1.5 items-center">{PRESET_COLORS.slice(8).map(c=>(
                <button key={c} type="button" onClick={()=>applyColor(c)}
                  className="w-4 h-4 rounded-full hover:scale-110 transition-all shrink-0"
                  style={{ backgroundColor:c, boxShadow:c==='#FFFFFF'?'inset 0 0 0 1px rgba(255,255,255,0.15)':undefined, outline: activeColor===c?`2px solid ${c}`:'2px solid transparent', outlineOffset:'2px' }}
                />
              ))}
              {activeColor && (
                <button type="button" onClick={()=>{insertAt('{/c}');setActiveColor(null);}}
                  className="w-4 h-4 rounded-full border border-white/[0.15] bg-white/[0.05] flex items-center justify-center hover:bg-white/[0.1] transition-all ml-0.5"
                >
                  <X size={7} className="text-white/50" />
                </button>
              )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Font size */}
      <div className="relative" ref={sizeRef}>
        <button type="button" title="Font size" onClick={() => setShowSizes(p => !p)} className={btnCls(!!activeSize || showSizes)}>
          <CaseSensitive size={12} />
        </button>
        <AnimatePresence>
          {showSizes && (
            <motion.div initial={{ opacity:0,y:4,scale:0.96 }} animate={{ opacity:1,y:0,scale:1 }} exit={{ opacity:0,y:4,scale:0.96 }}
              transition={{ duration:0.1 }}
              className="absolute bottom-full left-0 mb-1.5 z-50 w-32 rounded-xl bg-nv-channels border border-white/[0.08] shadow-2xl overflow-hidden py-0.5"
            >
              {FONT_SIZES.map(({ id, label, cls }) => (
                <button key={id} type="button" onClick={() => applySize(id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 transition-colors text-left ${
                    (activeSize===id||(!activeSize&&id==='md'))
                      ? 'bg-nv-accent/10 text-nv-accent' : 'hover:bg-white/[0.06] text-nv-text-primary'
                  }`}
                >
                  <span className={`${cls} leading-none w-5 text-center shrink-0`}>A</span>
                  <span className="text-[11px] text-nv-text-secondary">{label}</span>
                  {(activeSize===id||(!activeSize&&id==='md')) && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-nv-accent shrink-0" />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AnnouncementsView({ channel, serverId }) {
  const { activeServerApi, serverDetails } = useApp();
  const { user } = useAuth();
  const { socket } = useSocket();

  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [showCreate, setShowCreate]       = useState(false);
  const [title, setTitle]                 = useState('');
  const [content, setContent]             = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [deletingId, setDeletingId]       = useState(null);

  const contentRef = useRef(null);

  const serverObj = serverDetails[serverId]?.server;
  const isOwner   = serverObj?.owner_id === user?.id;

  // auto-resize content textarea
  useEffect(() => {
    const ta = contentRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 280) + 'px';
  }, [content]);

  const load = useCallback(async () => {
    if (!activeServerApi || !channel?.id) return;
    try {
      const data = await activeServerApi.getAnnouncements(channel.id);
      setAnnouncements(data.announcements || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeServerApi, channel?.id]);

  useEffect(() => { load(); }, [load]);

  // Live reload on channel:updated
  useEffect(() => {
    if (!socket) return;
    const h = (data) => { if (data?.channelId === channel?.id) load(); };
    socket.on('channel:updated', h);
    return () => socket.off('channel:updated', h);
  }, [socket, channel?.id, load]);

  const handleCreate = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await activeServerApi.createAnnouncement(channel.id, { title: title.trim(), content });
      setTitle(''); setContent(''); setShowCreate(false);
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try { await activeServerApi.deleteAnnouncement(channel.id, id); }
    catch { /* ignore */ }
    finally { setDeletingId(null); }
  };

  return (
    <div className="flex-1 flex flex-col bg-nv-content min-w-0 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-white/[0.05] shrink-0">
        <div className="flex items-center gap-2">
          <Megaphone size={15} className="text-nv-text-tertiary shrink-0" />
          <span className="text-sm font-semibold text-nv-text-primary truncate">{channel.name}</span>
        </div>
        {isOwner && (
          <button
            onClick={() => setShowCreate(p => !p)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all ${
              showCreate
                ? 'bg-nv-accent/20 text-nv-accent'
                : 'bg-white/[0.05] text-nv-text-secondary hover:bg-white/[0.09] hover:text-nv-text-primary'
            }`}
          >
            <Plus size={12} />
            New Announcement
          </button>
        )}
      </div>

      {/* ── Create form ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCreate && isOwner && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden shrink-0"
          >
            <div className="mx-4 mt-4 rounded-2xl bg-nv-surface/40 border border-white/[0.07]">
              {/* Title */}
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Announcement title…"
                className="w-full bg-transparent text-sm font-semibold text-nv-text-primary placeholder-nv-text-tertiary px-3.5 pt-3 pb-2 focus:outline-none"
                onKeyDown={e => e.key === 'Escape' && setShowCreate(false)}
              />
              <div className="mx-3.5 h-px bg-white/[0.05]" />

              {/* Content textarea with format bar */}
              <textarea
                ref={contentRef}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Write your announcement… (supports formatting)"
                rows={3}
                className="w-full bg-transparent text-sm text-nv-text-primary placeholder-nv-text-tertiary resize-none focus:outline-none leading-relaxed px-3.5 py-2.5"
                style={{ minHeight: '72px', maxHeight: '280px' }}
              />

              {/* Format bar */}
              <MiniFormatBar textareaRef={contentRef} value={content} setValue={setContent} />

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-3 pb-3 pt-1">
                <button
                  onClick={() => { setShowCreate(false); setTitle(''); setContent(''); }}
                  className="px-3 py-1.5 rounded-lg text-xs text-nv-text-tertiary hover:text-nv-text-primary transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCreate}
                  disabled={!title.trim() || submitting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-nv-accent/20 text-nv-accent hover:bg-nv-accent/30 transition-all disabled:opacity-40"
                >
                  <Send size={11} />
                  Publish
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Announcement list ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 rounded-full border-2 border-nv-accent/30 border-t-nv-accent animate-spin" />
          </div>
        )}

        {!loading && announcements.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3">
              <Megaphone size={20} className="text-nv-text-tertiary" />
            </div>
            <p className="text-sm font-medium text-nv-text-secondary">No announcements yet</p>
            {isOwner && (
              <p className="text-xs text-nv-text-tertiary mt-1">Click "New Announcement" to post one.</p>
            )}
          </div>
        )}

        <AnimatePresence initial={false}>
          {announcements.map((a) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="group rounded-2xl bg-nv-surface/30 border border-white/[0.06] hover:border-white/[0.1] transition-all overflow-hidden"
            >
              {/* Date/time header bar */}
              <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/[0.05] bg-white/[0.02]">
                <span className="text-[11px] text-nv-text-tertiary">
                  {formatTimestamp(a.created_at)}
                </span>
                <span className="text-[11px] text-nv-text-tertiary/70">
                  {a.creator_display_name || a.creator_username || 'Unknown'}
                </span>
              </div>

              {/* Content */}
              <div className="px-3.5 py-3">
                {/* Title */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h3 className="text-sm font-semibold text-nv-text-primary leading-snug">
                    {a.title}
                  </h3>
                  {isOwner && (
                    <button
                      onClick={() => handleDelete(a.id)}
                      disabled={deletingId === a.id}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-danger hover:bg-nv-danger/10 transition-all shrink-0 disabled:opacity-30"
                      title="Delete announcement"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                {/* Body */}
                {a.content && (
                  <div className="text-nv-text-secondary/90">
                    <MessageContent content={a.content} />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
