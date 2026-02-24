import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone, Plus, Trash2, X, Send, Bold, Underline,
  Strikethrough, Code2, Palette, CaseSensitive, Pencil, Check,
} from 'lucide-react';
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

function formatDateOnly(iso) {
  return new Date(iso).toLocaleDateString([], {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function isSameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

// ── FloatingPanel ─────────────────────────────────────────────────────────────
// Renders children via React portal anchored to a button ref.
// Completely escapes all overflow-hidden / transform ancestors.
function FloatingPanel({ open, onClose, anchorRef, children }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);

  // Calculate position synchronously before first paint
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Outside-click closes the panel
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (anchorRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [open, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <AnimatePresence>
      {open && pos && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -4, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.97 }}
          transition={{ duration: 0.1 }}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ── MiniFormatBar ─────────────────────────────────────────────────────────────
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

  // Button refs for portal anchor positioning
  const colorBtnRef = useRef(null);
  const sizeBtnRef  = useRef(null);

  const insertAt = useCallback((text) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    setValue(value.slice(0, s) + text + value.slice(e));
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
    if (activeColor) {
      insertAt('{/c}');
      if (hex === activeColor) { setActiveColor(null); setShowColors(false); return; }
    }
    insertAt(`{c:${hex}}`); setActiveColor(hex); setShowColors(false);
  };

  const applySize = (id) => {
    if (activeSize) {
      insertAt('{/fs}');
      if (id === activeSize || id === 'md') { setActiveSize(null); setShowSizes(false); return; }
    }
    if (id !== 'md') { insertAt(`{fs:${id}}`); setActiveSize(id); } else { setActiveSize(null); }
    setShowSizes(false);
  };

  const btnCls = (active) =>
    `w-6 h-6 rounded-md flex items-center justify-center transition-all ${
      active ? 'bg-nv-accent/20 text-nv-accent' : 'text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06]'
    }`;

  return (
    <div className="flex items-center gap-0.5 px-1 pb-1 pt-0.5 border-t border-white/[0.04]">
      {/* Format toggles */}
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

      {/* Color picker — portal-based so overflow-hidden never clips it */}
      <button
        ref={colorBtnRef}
        type="button"
        title="Text color"
        onClick={() => { setShowSizes(false); setShowColors(p => !p); }}
        className={btnCls(!!activeColor || showColors)}
        style={activeColor ? { color: activeColor } : {}}
      >
        <Palette size={11} />
      </button>
      <FloatingPanel open={showColors} onClose={() => setShowColors(false)} anchorRef={colorBtnRef}>
        <div className="rounded-xl bg-nv-channels border border-white/[0.08] shadow-2xl p-2 flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            {PRESET_COLORS.slice(0, 8).map(c => (
              <button key={c} type="button" onClick={() => applyColor(c)}
                className="w-4 h-4 rounded-full hover:scale-110 transition-all shrink-0"
                style={{ backgroundColor: c, outline: activeColor === c ? `2px solid ${c}` : '2px solid transparent', outlineOffset: '2px' }}
              />
            ))}
          </div>
          <div className="flex gap-1.5 items-center">
            {PRESET_COLORS.slice(8).map(c => (
              <button key={c} type="button" onClick={() => applyColor(c)}
                className="w-4 h-4 rounded-full hover:scale-110 transition-all shrink-0"
                style={{
                  backgroundColor: c,
                  boxShadow: c === '#FFFFFF' ? 'inset 0 0 0 1px rgba(255,255,255,0.15)' : undefined,
                  outline: activeColor === c ? `2px solid ${c}` : '2px solid transparent',
                  outlineOffset: '2px',
                }}
              />
            ))}
            {activeColor && (
              <button type="button" onClick={() => { insertAt('{/c}'); setActiveColor(null); }}
                className="w-4 h-4 rounded-full border border-white/[0.15] bg-white/[0.05] flex items-center justify-center hover:bg-white/[0.1] transition-all ml-0.5"
              >
                <X size={7} className="text-white/50" />
              </button>
            )}
          </div>
        </div>
      </FloatingPanel>

      {/* Font size — portal-based */}
      <button
        ref={sizeBtnRef}
        type="button"
        title="Font size"
        onClick={() => { setShowColors(false); setShowSizes(p => !p); }}
        className={btnCls(!!activeSize || showSizes)}
      >
        <CaseSensitive size={12} />
      </button>
      <FloatingPanel open={showSizes} onClose={() => setShowSizes(false)} anchorRef={sizeBtnRef}>
        <div className="rounded-xl bg-nv-channels border border-white/[0.08] shadow-2xl overflow-hidden py-0.5 w-32">
          {FONT_SIZES.map(({ id, label, cls }) => (
            <button key={id} type="button" onClick={() => applySize(id)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 transition-colors text-left ${
                (activeSize === id || (!activeSize && id === 'md'))
                  ? 'bg-nv-accent/10 text-nv-accent' : 'hover:bg-white/[0.06] text-nv-text-primary'
              }`}
            >
              <span className={`${cls} leading-none w-5 text-center shrink-0`}>A</span>
              <span className="text-[11px] text-nv-text-secondary">{label}</span>
              {(activeSize === id || (!activeSize && id === 'md')) && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-nv-accent shrink-0" />
              )}
            </button>
          ))}
        </div>
      </FloatingPanel>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AnnouncementsView({ channel, serverId }) {
  const { activeServerApi, serverDetails, ownSocket } = useApp();
  const { user }   = useAuth();
  const { socket } = useSocket();

  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [showCreate, setShowCreate]       = useState(false);
  const [content, setContent]             = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [deletingId, setDeletingId]       = useState(null);

  const [editingId, setEditingId]     = useState(null);
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit]   = useState(false);

  const contentRef = useRef(null);
  const editRef    = useRef(null);

  const serverObj = serverDetails[serverId]?.server;
  const isOwner   = serverObj?.owner_id === user?.id;

  useEffect(() => {
    const ta = contentRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 280) + 'px';
  }, [content]);

  useEffect(() => {
    const ta = editRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 320) + 'px';
  }, [editContent]);

  const load = useCallback(async () => {
    if (!activeServerApi || !channel?.id) return;
    try {
      const data = await activeServerApi.getAnnouncements(channel.id);
      setAnnouncements(data.announcements || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeServerApi, channel?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!channel?.id) return;
    const h = (data) => { if (data?.channelId === channel.id) load(); };
    socket?.emit('channel:subscribe', { channelId: channel.id });
    socket?.on('channel:updated', h);
    ownSocket?.on('channel:updated', h);
    return () => {
      socket?.off('channel:updated', h);
      socket?.emit('channel:unsubscribe', { channelId: channel.id });
      ownSocket?.off('channel:updated', h);
    };
  }, [socket, ownSocket, channel?.id, load]);

  // ── Create ─────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await activeServerApi.createAnnouncement(channel.id, { content: content.trim() });
      if (result?.announcement) setAnnouncements(prev => [result.announcement, ...prev]);
      setContent('');
      setShowCreate(false);
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const startEdit = (a) => {
    setEditingId(a.id);
    setEditContent(a.content);
    requestAnimationFrame(() => editRef.current?.focus());
  };

  const cancelEdit = () => { setEditingId(null); setEditContent(''); };

  const saveEdit = async (id) => {
    if (!editContent.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await activeServerApi.updateAnnouncement(channel.id, id, { content: editContent.trim() });
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, content: editContent.trim() } : a));
      setEditingId(null);
      setEditContent('');
    } catch { /* ignore */ }
    finally { setSavingEdit(false); }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await activeServerApi.deleteAnnouncement(channel.id, id);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch { /* ignore */ }
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
              <textarea
                ref={contentRef}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Write your announcement… (use formatting to add headers, bold text, colors, etc.)"
                rows={3}
                className="w-full bg-transparent text-sm text-nv-text-primary placeholder-nv-text-tertiary resize-none focus:outline-none leading-relaxed px-3.5 pt-3 pb-2"
                style={{ minHeight: '72px', maxHeight: '280px' }}
                onKeyDown={e => e.key === 'Escape' && setShowCreate(false)}
              />
              <MiniFormatBar textareaRef={contentRef} value={content} setValue={setContent} />
              <div className="flex items-center justify-end gap-2 px-3 pb-3 pt-1">
                <button
                  onClick={() => { setShowCreate(false); setContent(''); }}
                  className="px-3 py-1.5 rounded-lg text-xs text-nv-text-tertiary hover:text-nv-text-primary transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCreate}
                  disabled={!content.trim() || submitting}
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

      {/* ── List ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">

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
            {isOwner && <p className="text-xs text-nv-text-tertiary mt-1">Click "New Announcement" to post one.</p>}
          </div>
        )}

        <AnimatePresence initial={false}>
          {announcements.map((a, idx) => {
            const prevDate    = idx > 0 ? announcements[idx - 1].created_at : null;
            const showDateSep = idx > 0 && !isSameDay(prevDate, a.created_at);
            const isEditing   = editingId === a.id;

            return (
              <motion.div key={a.id}>
                {/* Separator */}
                {idx > 0 && (
                  showDateSep ? (
                    <div className="flex items-center gap-3 my-5">
                      <div className="flex-1 h-px bg-white/[0.05]" />
                      <span className="text-[10px] text-nv-text-tertiary/60 px-1 shrink-0">{formatDateOnly(a.created_at)}</span>
                      <div className="flex-1 h-px bg-white/[0.05]" />
                    </div>
                  ) : (
                    <div className="h-px bg-white/[0.05] my-3" />
                  )
                )}

                {/* ── Card ─────────────────────────────────────────────────── */}
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.18 }}
                  className="group rounded-2xl bg-nv-surface/30 border border-white/[0.06] hover:border-white/[0.09] transition-all overflow-hidden"
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/[0.05] bg-white/[0.02]">
                    <span className="text-[11px] text-nv-text-tertiary">
                      {formatTimestamp(a.created_at)}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-nv-text-tertiary/70 mr-1">
                        {a.creator_display_name || a.creator_username || 'Unknown'}
                      </span>
                      {isOwner && !isEditing && (
                        <>
                          <button
                            onClick={() => startEdit(a)}
                            className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-accent hover:bg-nv-accent/10 transition-all shrink-0"
                            title="Edit"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => handleDelete(a.id)}
                            disabled={deletingId === a.id}
                            className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-danger hover:bg-nv-danger/10 transition-all shrink-0 disabled:opacity-30"
                            title="Delete"
                          >
                            <Trash2 size={11} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="px-3.5 py-3">
                    {isEditing ? (
                      <div className="rounded-xl bg-nv-surface/40 border border-white/[0.07] overflow-visible">
                        <textarea
                          ref={editRef}
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          rows={3}
                          className="w-full bg-transparent text-sm text-nv-text-primary resize-none focus:outline-none leading-relaxed px-3 pt-2.5 pb-2"
                          style={{ minHeight: '60px', maxHeight: '320px' }}
                          onKeyDown={e => e.key === 'Escape' && cancelEdit()}
                        />
                        <MiniFormatBar textareaRef={editRef} value={editContent} setValue={setEditContent} />
                        <div className="flex items-center justify-end gap-1.5 px-2.5 pb-2.5 pt-1">
                          <button onClick={cancelEdit}
                            className="px-2.5 py-1 rounded-lg text-[11px] text-nv-text-tertiary hover:text-nv-text-primary transition-colors"
                          >
                            Cancel
                          </button>
                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={() => saveEdit(a.id)}
                            disabled={!editContent.trim() || savingEdit}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-nv-accent/20 text-nv-accent hover:bg-nv-accent/30 transition-all disabled:opacity-40"
                          >
                            <Check size={10} />
                            Save
                          </motion.button>
                        </div>
                      </div>
                    ) : (
                      <MessageContent content={a.content} />
                    )}
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
