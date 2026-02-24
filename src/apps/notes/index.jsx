import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Trash2, FileText, Pin } from 'lucide-react';

const NOTES_KEY = 'nv_app_notes';

function loadNotes() {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveNotes(notes) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch {}
}

function createNote() {
  return {
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    content: '',
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  const oneDay = 86400000;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < oneDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 7 * oneDay) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function NotesApp() {
  const [notes, setNotes] = useState(() => loadNotes());
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [saveIndicator, setSaveIndicator] = useState(false);
  const saveTimer = useRef(null);
  const contentRef = useRef(null);

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  // Persist on change
  useEffect(() => {
    saveNotes(notes);
  }, [notes]);

  // Auto-select first note on load
  useEffect(() => {
    if (!selectedId && notes.length > 0) {
      setSelectedId(notes[0].id);
    }
  }, []);

  const filteredNotes = useMemo(() => {
    const q = query.toLowerCase().trim();
    const result = q
      ? notes.filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.content.toLowerCase().includes(q)
        )
      : [...notes];

    // Pinned first, then by updatedAt desc
    return result.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [notes, query]);

  const createNewNote = useCallback(() => {
    const note = createNote();
    setNotes((prev) => [note, ...prev]);
    setSelectedId(note.id);
    setQuery('');
    // Focus title after render
    setTimeout(() => {
      const el = document.getElementById('note-title-input');
      el?.focus();
    }, 50);
  }, []);

  const deleteNote = useCallback(
    (id) => {
      setNotes((prev) => {
        const next = prev.filter((n) => n.id !== id);
        if (selectedId === id) {
          setSelectedId(next.length > 0 ? next[0].id : null);
        }
        return next;
      });
    },
    [selectedId]
  );

  const togglePin = useCallback((id) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n))
    );
  }, []);

  const updateNote = useCallback((id, fields) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, ...fields, updatedAt: Date.now() } : n
      )
    );

    // Flash save indicator
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveIndicator(true);
      setTimeout(() => setSaveIndicator(false), 1200);
    }, 400);
  }, []);

  const handleTitleChange = (e) => {
    if (!selectedNote) return;
    updateNote(selectedNote.id, { title: e.target.value });
  };

  const handleContentChange = (e) => {
    if (!selectedNote) return;
    updateNote(selectedNote.id, { content: e.target.value });
  };

  // Tab key inserts 2 spaces in content area
  const handleContentKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.target;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const val = el.value;
      const newVal = val.slice(0, start) + '  ' + val.slice(end);
      updateNote(selectedNote.id, { content: newVal });
      setTimeout(() => {
        el.selectionStart = start + 2;
        el.selectionEnd = start + 2;
      }, 0);
    }
  };

  const previewLine = (note) => {
    const lines = note.content.split('\n').filter((l) => l.trim());
    return lines[0]?.trim() || 'No content';
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel — note list */}
      <div className="w-[240px] shrink-0 border-r border-white/[0.06] flex flex-col bg-nv-sidebar/60">
        {/* Toolbar */}
        <div className="px-3 pt-3 pb-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nv-text-tertiary pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/[0.07] rounded-lg pl-7 pr-3 py-1.5 text-xs text-nv-text-primary placeholder-nv-text-tertiary outline-none focus:border-nv-accent/40 transition-colors"
            />
          </div>
          <button
            onClick={createNewNote}
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-nv-accent/15 text-nv-accent hover:bg-nv-accent/25 transition-all shrink-0"
            title="New note"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Note count */}
        <p className="px-3 pb-1.5 text-[10px] text-nv-text-tertiary">
          {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'}
        </p>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <FileText size={24} className="text-nv-text-tertiary/40" />
              <p className="text-xs text-nv-text-tertiary">
                {query ? 'No results' : 'No notes yet'}
              </p>
              {!query && (
                <button
                  onClick={createNewNote}
                  className="text-xs text-nv-accent hover:underline mt-1"
                >
                  Create one
                </button>
              )}
            </div>
          ) : (
            filteredNotes.map((note) => (
              <motion.button
                key={note.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => setSelectedId(note.id)}
                className={`w-full text-left px-2.5 py-2 rounded-xl transition-all group relative ${
                  selectedId === note.id
                    ? 'bg-white/[0.09] text-nv-text-primary'
                    : 'text-nv-text-secondary hover:bg-white/[0.05] hover:text-nv-text-primary'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[12px] font-medium truncate leading-snug flex-1">
                    {note.title || 'Untitled'}
                  </p>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span
                      onClick={(e) => { e.stopPropagation(); togglePin(note.id); }}
                      className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                        note.pinned
                          ? 'text-nv-accent opacity-100'
                          : 'text-nv-text-tertiary hover:text-nv-accent'
                      }`}
                      title={note.pinned ? 'Unpin' : 'Pin'}
                    >
                      <Pin size={10} />
                    </span>
                    <span
                      onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                      className="w-5 h-5 rounded flex items-center justify-center text-nv-text-tertiary hover:text-nv-danger transition-all"
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-nv-text-tertiary truncate mt-0.5">
                  {previewLine(note)}
                </p>
                <p className="text-[9px] text-nv-text-tertiary/60 mt-0.5">
                  {note.pinned && <span className="text-nv-accent mr-1">·</span>}
                  {formatDate(note.updatedAt)}
                </p>
              </motion.button>
            ))
          )}
        </div>
      </div>

      {/* Right panel — editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedNote ? (
          <>
            {/* Note header */}
            <div className="px-6 pt-4 pb-0 flex items-center justify-between shrink-0">
              <input
                id="note-title-input"
                type="text"
                value={selectedNote.title}
                onChange={handleTitleChange}
                placeholder="Title"
                className="flex-1 bg-transparent text-xl font-semibold text-nv-text-primary placeholder-nv-text-tertiary/50 outline-none"
              />
              <div className="flex items-center gap-2 ml-4 shrink-0">
                <AnimatePresence>
                  {saveIndicator && (
                    <motion.span
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-[10px] text-nv-accent"
                    >
                      Saved
                    </motion.span>
                  )}
                </AnimatePresence>
                <button
                  onClick={() => togglePin(selectedNote.id)}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                    selectedNote.pinned
                      ? 'bg-nv-accent/15 text-nv-accent'
                      : 'text-nv-text-tertiary hover:text-nv-accent hover:bg-nv-accent/10'
                  }`}
                  title={selectedNote.pinned ? 'Unpin note' : 'Pin note'}
                >
                  <Pin size={13} />
                </button>
                <button
                  onClick={() => deleteNote(selectedNote.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-danger hover:bg-nv-danger/10 transition-all"
                  title="Delete note"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Divider with date */}
            <div className="px-6 py-2 flex items-center gap-3 shrink-0">
              <p className="text-[11px] text-nv-text-tertiary">
                {new Date(selectedNote.updatedAt).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            {/* Content editor */}
            <textarea
              ref={contentRef}
              value={selectedNote.content}
              onChange={handleContentChange}
              onKeyDown={handleContentKeyDown}
              placeholder="Start writing…"
              className="flex-1 px-6 pb-6 bg-transparent text-sm text-nv-text-primary placeholder-nv-text-tertiary/40 outline-none resize-none leading-relaxed font-[inherit]"
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-16 h-16 rounded-3xl bg-nv-accent/10 flex items-center justify-center">
              <FileText size={28} className="text-nv-accent/60" />
            </div>
            <div>
              <p className="text-sm font-medium text-nv-text-primary">No note selected</p>
              <p className="text-xs text-nv-text-tertiary mt-1">
                Select a note or create a new one
              </p>
            </div>
            <button
              onClick={createNewNote}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-nv-accent/15 text-nv-accent text-sm font-medium hover:bg-nv-accent/25 transition-all"
            >
              <Plus size={14} />
              New Note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
