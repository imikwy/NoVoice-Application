import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Trash2, Pin,
  MousePointer2, Pencil, Type, Image as ImageIcon,
  StickyNote, Square, Move,
  GripHorizontal, Maximize2, Layers, Grid3X3,
  Undo2, Redo2,
} from 'lucide-react';
import { nanoid } from 'nanoid';

const NOTES_KEY = 'nv_whiteboard_notes';
const CANVAS_W = 3000;
const CANVAS_H = 2200;
const PALETTE = ['#34C759', '#0A84FF', '#BF5AF2', '#FF9F0A', '#FF3B30', '#ffffff'];

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
    id: `wb_${Date.now()}_${nanoid(6)}`,
    title: '',
    elements: [],
    gridType: 'dots',
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
  if (diff < 7 * oneDay) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Clamp pan so the artboard stays at least partially visible
function clampPan(x, y, zoom, containerW, containerH) {
  const margin = 120;
  return {
    x: Math.min(containerW - margin, Math.max(margin - CANVAS_W * zoom, x)),
    y: Math.min(containerH - margin, Math.max(margin - CANVAS_H * zoom, y)),
  };
}

export default function WhiteboardApp() {
  const [notes, setNotes] = useState(() => loadNotes());
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState('#34C759');
  const [saveIndicator, setSaveIndicator] = useState(false);
  const [showGridMenu, setShowGridMenu] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const [viewState, setViewState] = useState({ x: 0, y: 0, zoom: 1 });
  const viewStateRef = useRef(viewState);
  useEffect(() => { viewStateRef.current = viewState; }, [viewState]);

  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [currentPath, setCurrentPath] = useState(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const saveTimer = useRef(null);

  // Keep a ref to selectedNote so drag handlers always have fresh data
  const selectedNoteRef = useRef(null);
  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;
  useEffect(() => { selectedNoteRef.current = selectedNote; }, [selectedNote]);

  useEffect(() => { saveNotes(notes); }, [notes]);
  useEffect(() => {
    if (!selectedId && notes.length > 0) setSelectedId(notes[0].id);
  }, []);

  const filteredNotes = useMemo(() => {
    const q = query.toLowerCase().trim();
    const result = q ? notes.filter((n) => n.title.toLowerCase().includes(q)) : [...notes];
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
  }, []);

  const deleteNote = useCallback((id) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      if (selectedId === id) setSelectedId(next.length > 0 ? next[0].id : null);
      return next;
    });
  }, [selectedId]);

  const togglePin = useCallback((id) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)));
  }, []);

  const updateNote = useCallback((id, fields) => {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, ...fields, updatedAt: Date.now() } : n));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveIndicator(true);
      setTimeout(() => setSaveIndicator(false), 1200);
    }, 400);
  }, []);

  // Use ref-based updateElement so drag closures always see current state
  const updateElementRef = useRef(null);
  updateElementRef.current = (id, fields) => {
    const note = selectedNoteRef.current;
    if (!note) return;
    const newElements = note.elements.map(el => el.id === id ? { ...el, ...fields } : el);
    updateNote(note.id, { elements: newElements });
  };

  const removeElement = useCallback((id) => {
    const note = selectedNoteRef.current;
    if (!note) return;
    pushHistoryRef.current(note.elements);
    updateNote(note.id, { elements: note.elements.filter(el => el.id !== id) });
  }, [updateNote]);

  // ── Undo / Redo ──
  const pushHistoryRef = useRef(null);

  const pushHistory = useCallback((elements) => {
    setUndoStack(prev => [...prev.slice(-49), elements]);
    setRedoStack([]);
  }, []);
  pushHistoryRef.current = pushHistory;

  const undoFnRef = useRef(null);
  const redoFnRef = useRef(null);

  const undo = useCallback(() => {
    const note = selectedNoteRef.current;
    if (!note) return;
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      setRedoStack(r => [note.elements, ...r.slice(0, 49)]);
      updateNote(note.id, { elements: snapshot });
      return prev.slice(0, -1);
    });
  }, [updateNote]);
  undoFnRef.current = undo;

  const redo = useCallback(() => {
    const note = selectedNoteRef.current;
    if (!note) return;
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const snapshot = prev[0];
      setUndoStack(r => [...r.slice(0, 49), note.elements]);
      updateNote(note.id, { elements: snapshot });
      return prev.slice(1);
    });
  }, [updateNote]);
  redoFnRef.current = redo;

  // Reset history when switching boards
  useEffect(() => { setUndoStack([]); setRedoStack([]); }, [selectedId]);

  // ── Ctrl+V paste (image or text → new element at canvas center) ──
  useEffect(() => {
    const onPaste = (e) => {
      if (!selectedNoteRef.current) return;
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'textarea' || tag === 'input') return; // let native paste work

      const items = Array.from(e.clipboardData?.items || []);

      const imageItem = items.find(i => i.type.startsWith('image/'));
      if (imageItem) {
        e.preventDefault();
        const file = imageItem.getAsFile();
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const note = selectedNoteRef.current;
          if (!note) return;
          const vs = viewStateRef.current;
          const c = containerRef.current;
          const cx = ((c?.offsetWidth ?? 800) / 2 - vs.x) / vs.zoom;
          const cy = ((c?.offsetHeight ?? 600) / 2 - vs.y) / vs.zoom;
          const newEl = {
            id: nanoid(), type: 'image',
            x: Math.min(Math.max(0, cx - 150), CANVAS_W - 300),
            y: Math.min(Math.max(0, cy - 100), CANVAS_H - 200),
            width: 300, height: 200, content: ev.target.result,
          };
          pushHistoryRef.current(note.elements);
          updateNote(note.id, { elements: [...note.elements, newEl] });
        };
        reader.readAsDataURL(file);
        return;
      }

      const textItem = items.find(i => i.type === 'text/plain');
      if (textItem) {
        e.preventDefault();
        textItem.getAsString((text) => {
          if (!text.trim()) return;
          const note = selectedNoteRef.current;
          if (!note) return;
          const vs = viewStateRef.current;
          const c = containerRef.current;
          const cx = ((c?.offsetWidth ?? 800) / 2 - vs.x) / vs.zoom;
          const cy = ((c?.offsetHeight ?? 600) / 2 - vs.y) / vs.zoom;
          const newEl = {
            id: nanoid(), type: 'text',
            x: Math.min(Math.max(0, cx - 100), CANVAS_W - 200),
            y: Math.min(Math.max(0, cy - 10), CANVAS_H - 40),
            width: 200, height: 40, content: text, color,
          };
          pushHistoryRef.current(note.elements);
          updateNote(note.id, { elements: [...note.elements, newEl] });
        });
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [color, updateNote]);

  // ── Ctrl+Z / Ctrl+Y keyboard shortcuts ──
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'textarea' || tag === 'input') return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); undoFnRef.current(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redoFnRef.current(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Canvas handlers ──

  const handleMouseDown = (e) => {
    if (!selectedNote) return;
    if (e.button === 1 || e.altKey) {
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const vs = viewStateRef.current;
    const rawX = (e.clientX - rect.left - vs.x) / vs.zoom;
    const rawY = (e.clientY - rect.top - vs.y) / vs.zoom;
    // Clamp to artboard bounds so elements can't be placed outside the canvas
    const x = Math.min(Math.max(0, rawX), CANVAS_W - 10);
    const y = Math.min(Math.max(0, rawY), CANVAS_H - 10);

    if (tool === 'draw') {
      setIsDrawing(true);
      setCurrentPath({ id: nanoid(), type: 'draw', points: [[x, y]], color, strokeWidth: 3 });
    } else if (tool === 'text' || tool === 'sticky') {
      const w = tool === 'sticky' ? 160 : 200;
      const h = tool === 'sticky' ? 160 : 40;
      const newElement = {
        id: nanoid(), type: tool,
        x: Math.min(x, CANVAS_W - w),
        y: Math.min(y, CANVAS_H - h),
        width: w, height: h,
        content: tool === 'sticky' ? 'Note...' : 'Text...',
        color: tool === 'sticky' ? '#fde68a' : color,
      };
      pushHistory(selectedNote.elements);
      updateNote(selectedId, { elements: [...selectedNote.elements, newElement] });
      setTool('select');
    } else if (tool === 'shape') {
      const newElement = {
        id: nanoid(), type: 'shape', shape: 'rect',
        x: Math.min(x, CANVAS_W - 120),
        y: Math.min(y, CANVAS_H - 80),
        width: 120, height: 80, color,
      };
      pushHistory(selectedNote.elements);
      updateNote(selectedId, { elements: [...selectedNote.elements, newElement] });
      setTool('select');
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setViewState(prev => {
        const container = containerRef.current;
        const cw = container?.offsetWidth ?? 800;
        const ch = container?.offsetHeight ?? 600;
        const clamped = clampPan(prev.x + dx, prev.y + dy, prev.zoom, cw, ch);
        return { ...prev, ...clamped };
      });
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (!isDrawing || tool !== 'draw') return;
    const rect = canvasRef.current.getBoundingClientRect();
    const vs = viewStateRef.current;
    const x = (e.clientX - rect.left - vs.x) / vs.zoom;
    const y = (e.clientY - rect.top - vs.y) / vs.zoom;
    setCurrentPath(prev => ({ ...prev, points: [...prev.points, [x, y]] }));
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    if (isDrawing && currentPath) {
      pushHistory(selectedNote.elements);
      updateNote(selectedId, { elements: [...selectedNote.elements, currentPath] });
      setCurrentPath(null);
      setIsDrawing(false);
    }
  };

  const handleWheel = (e) => {
    if (!selectedNote) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const vs = viewStateRef.current;
    const newZoom = Math.min(Math.max(vs.zoom * factor, 0.1), 5);
    const newX = vs.x + (mouseX - vs.x) * (1 - newZoom / vs.zoom);
    const newY = vs.y + (mouseY - vs.y) * (1 - newZoom / vs.zoom);
    const container = containerRef.current;
    const cw = container?.offsetWidth ?? 800;
    const ch = container?.offsetHeight ?? 600;
    const clamped = clampPan(newX, newY, newZoom, cw, ch);
    setViewState({ zoom: newZoom, ...clamped });
  };

  const gridStyle = (() => {
    if (!selectedNote) return {};
    const gt = selectedNote.gridType || 'dots';
    if (gt === 'none') return {};
    const size = `${30 * viewState.zoom}px ${30 * viewState.zoom}px`;
    const pos = `${viewState.x}px ${viewState.y}px`;
    if (gt === 'lines') return {
      backgroundImage: `linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)`,
      backgroundSize: size, backgroundPosition: pos,
    };
    return {
      backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)`,
      backgroundSize: size, backgroundPosition: pos,
    };
  })();

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar ── */}
      <div className="w-[240px] shrink-0 border-r border-white/[0.06] flex flex-col bg-nv-sidebar/60 backdrop-blur-xl">
        <div className="px-3 pt-3 pb-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nv-text-tertiary pointer-events-none" />
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
            title="New whiteboard"
          >
            <Plus size={14} />
          </button>
        </div>

        <p className="px-3 pb-1.5 text-[10px] text-nv-text-tertiary">
          {filteredNotes.length} {filteredNotes.length === 1 ? 'board' : 'boards'}
        </p>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Layers size={24} className="text-nv-text-tertiary/40" />
              <p className="text-xs text-nv-text-tertiary">{query ? 'No results' : 'No boards yet'}</p>
              {!query && (
                <button onClick={createNewNote} className="text-xs text-nv-accent hover:underline mt-1">Create one</button>
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
                    {note.title || 'Untitled Board'}
                  </p>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span
                      onClick={(e) => { e.stopPropagation(); togglePin(note.id); }}
                      className={`w-5 h-5 rounded flex items-center justify-center transition-all ${note.pinned ? 'text-nv-accent opacity-100' : 'text-nv-text-tertiary hover:text-nv-accent'}`}
                    >
                      <Pin size={10} />
                    </span>
                    <span
                      onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                      className="w-5 h-5 rounded flex items-center justify-center text-nv-text-tertiary hover:text-nv-danger transition-all"
                    >
                      <Trash2 size={10} />
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-nv-text-tertiary mt-0.5">
                  {note.elements.length} element{note.elements.length !== 1 ? 's' : ''}
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

      {/* ── Canvas ── */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-nv-bg">
        {selectedNote ? (
          <>
            {/* Floating title bar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-sm px-4">
              <div className="bg-nv-sidebar/80 backdrop-blur-2xl border border-white/[0.08] rounded-2xl px-4 py-2 flex items-center gap-2 shadow-elevation-3">
                <input
                  type="text"
                  value={selectedNote.title}
                  onChange={(e) => updateNote(selectedId, { title: e.target.value })}
                  placeholder="Untitled Board"
                  className="flex-1 bg-transparent text-sm font-semibold text-nv-text-primary placeholder-nv-text-tertiary/50 outline-none text-center"
                />
                <AnimatePresence>
                  {saveIndicator && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      className="w-1.5 h-1.5 rounded-full bg-nv-accent shadow-glow-accent shrink-0"
                    />
                  )}
                </AnimatePresence>
                <div className="w-px h-4 bg-white/[0.08] mx-0.5" />
                <div className="relative">
                  <button
                    onClick={() => setShowGridMenu(!showGridMenu)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${showGridMenu ? 'bg-nv-accent/20 text-nv-accent' : 'text-nv-text-tertiary hover:bg-white/[0.06] hover:text-nv-text-primary'}`}
                  >
                    <Grid3X3 size={14} />
                  </button>
                  {showGridMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowGridMenu(false)} />
                      <div className="absolute top-full right-0 mt-2 w-28 bg-nv-sidebar border border-white/[0.08] rounded-xl shadow-elevation-3 py-1 z-50 overflow-hidden">
                        {['none', 'dots', 'lines'].map(type => (
                          <button
                            key={type}
                            onClick={() => { updateNote(selectedId, { gridType: type }); setShowGridMenu(false); }}
                            className={`w-full text-left px-3 py-1.5 text-xs capitalize transition-colors hover:bg-white/[0.05] ${(selectedNote.gridType || 'dots') === type ? 'text-nv-accent font-medium' : 'text-nv-text-secondary'}`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Canvas area */}
            <div
              ref={containerRef}
              className={`flex-1 relative overflow-hidden select-none ${isPanning ? 'cursor-grabbing' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            >
              {/* SVG layer: drawing paths + artboard boundary */}
              <svg
                ref={canvasRef}
                className="w-full h-full"
                style={{ backgroundColor: '#000000', ...gridStyle }}
              >
                <g transform={`translate(${viewState.x}, ${viewState.y}) scale(${viewState.zoom})`}>
                  {/* Artboard boundary */}
                  <rect
                    x={0} y={0} width={CANVAS_W} height={CANVAS_H}
                    fill="rgba(255,255,255,0.012)"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={1 / viewState.zoom}
                    rx={6 / viewState.zoom}
                  />
                  {/* Drawing paths */}
                  {selectedNote.elements.filter(el => el.type === 'draw').map(path => (
                    <polyline
                      key={path.id}
                      points={path.points.map(p => p.join(',')).join(' ')}
                      fill="none" stroke={path.color} strokeWidth={path.strokeWidth}
                      strokeLinecap="round" strokeLinejoin="round"
                    />
                  ))}
                  {currentPath && (
                    <polyline
                      points={currentPath.points.map(p => p.join(',')).join(' ')}
                      fill="none" stroke={currentPath.color} strokeWidth={currentPath.strokeWidth}
                      strokeLinecap="round" strokeLinejoin="round"
                    />
                  )}
                </g>
              </svg>

              {/* HTML elements layer */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.zoom})`,
                  transformOrigin: '0 0',
                }}
              >
                {selectedNote.elements.map(el => {
                  if (el.type === 'draw') return null;
                  return (
                    <BoardElement
                      key={el.id}
                      el={el}
                      zoom={viewState.zoom}
                      tool={tool}
                      updateElement={(id, fields) => updateElementRef.current(id, fields)}
                      removeElement={removeElement}
                      getSnapshot={() => selectedNoteRef.current?.elements ?? []}
                      onCommit={(snap) => pushHistoryRef.current(snap)}
                    />
                  );
                })}
              </div>
            </div>

            {/* Bottom toolbar */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
              <div className="bg-nv-sidebar/95 backdrop-blur-2xl border border-white/[0.08] rounded-2xl px-2 py-1.5 flex items-center gap-1 shadow-elevation-3">
                <ToolbarButton active={tool === 'select'} icon={<MousePointer2 size={16} />} onClick={() => setTool('select')} label="Select" />
                <ToolbarButton active={tool === 'draw'}   icon={<Pencil size={16} />}         onClick={() => setTool('draw')}   label="Draw" />
                <ToolbarButton active={tool === 'text'}   icon={<Type size={16} />}            onClick={() => setTool('text')}   label="Text" />
                <ToolbarButton active={tool === 'sticky'} icon={<StickyNote size={16} />}      onClick={() => setTool('sticky')} label="Sticky" />
                <ToolbarButton active={tool === 'shape'}  icon={<Square size={16} />}          onClick={() => setTool('shape')}  label="Shape" />
                <ToolbarButton active={tool === 'image'}  icon={<ImageIcon size={16} />}       onClick={() => setTool('image')}  label="Image" />

                <div className="w-px h-6 bg-white/[0.08] mx-1" />

                <div className="flex items-center gap-1 px-1">
                  {PALETTE.map(c => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className="rounded-full transition-all"
                      style={{
                        width: color === c ? 18 : 14,
                        height: color === c ? 18 : 14,
                        backgroundColor: c,
                        boxShadow: color === c ? '0 0 0 2px rgba(255,255,255,0.7)' : 'none',
                        opacity: color === c ? 1 : 0.55,
                      }}
                    />
                  ))}
                </div>

                <div className="w-px h-6 bg-white/[0.08] mx-1" />

                {/* Undo / Redo */}
                <button
                  onClick={undo}
                  disabled={undoStack.length === 0}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-25 text-nv-text-tertiary hover:bg-white/[0.06] hover:text-nv-text-primary disabled:hover:bg-transparent"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 size={14} />
                </button>
                <button
                  onClick={redo}
                  disabled={redoStack.length === 0}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-25 text-nv-text-tertiary hover:bg-white/[0.06] hover:text-nv-text-primary disabled:hover:bg-transparent"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 size={14} />
                </button>

                <div className="w-px h-6 bg-white/[0.08] mx-1" />

                <span className="text-[10px] text-nv-text-tertiary tabular-nums w-8 text-center font-medium">
                  {Math.round(viewState.zoom * 100)}%
                </span>
                <button
                  onClick={() => setViewState({ x: 0, y: 0, zoom: 1 })}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-nv-text-tertiary hover:bg-white/[0.06] hover:text-nv-text-primary transition-all"
                  title="Reset view"
                >
                  <Move size={13} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            <div className="w-16 h-16 rounded-3xl bg-nv-accent/10 flex items-center justify-center">
              <Layers size={28} className="text-nv-accent/60" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-nv-text-primary">No board selected</p>
              <p className="text-xs text-nv-text-tertiary mt-1">Select a board or create a new one</p>
            </div>
            <button
              onClick={createNewNote}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-nv-accent/15 text-nv-accent text-sm font-medium hover:bg-nv-accent/25 transition-all"
            >
              <Plus size={14} />
              New Board
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── BoardElement ──
   Uses manual mouse drag instead of framer-motion drag to correctly handle
   the CSS-scaled parent container. framer-motion drag inside scale() applies
   translate in screen-px which gets visually amplified by the scale factor.
   Manual approach: delta_canvas = delta_screen / zoom → pixel-perfect. */
function BoardElement({ el, zoom, tool, updateElement, removeElement, getSnapshot, onCommit }) {
  const textareaRef = useRef(null);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  useEffect(() => {
    if (el.type === 'text' && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [el.content, el.type]);

  const startDrag = (e) => {
    if (e.button !== 0 || tool !== 'select') return;
    e.preventDefault();
    e.stopPropagation();

    const z = zoomRef.current;
    const startX = e.clientX, startY = e.clientY;
    const origX = el.x, origY = el.y;
    const snapshot = getSnapshot();
    let moved = false;

    const onMove = (mv) => {
      moved = true;
      updateElement(el.id, {
        x: origX + (mv.clientX - startX) / z,
        y: origY + (mv.clientY - startY) / z,
      });
    };
    const onUp = () => {
      if (moved) onCommit(snapshot);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const z = zoomRef.current;
    const startX = e.clientX, startY = e.clientY;
    const origW = el.width || 100, origH = el.height || 100;
    const snapshot = getSnapshot();
    let resized = false;
    const onMove = (mv) => {
      resized = true;
      updateElement(el.id, {
        width: Math.max(50, origW + (mv.clientX - startX) / z),
        height: Math.max(20, origH + (mv.clientY - startY) / z),
      });
    };
    const onUp = () => {
      if (resized) onCommit(snapshot);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const isSelect = tool === 'select';

  return (
    // overflow:visible (default) is key: children positioned outside the box
    // (handle at top:-22, delete at top:-8) are still descendants → CSS :hover
    // on the group fires when mouse is over them → group-hover works correctly.
    <div
      className={`absolute group ${isSelect ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{ left: el.x, top: el.y, width: el.width, height: el.height }}
    >
      {/* Selection ring */}
      {isSelect && (
        <div className="absolute inset-0 rounded-lg ring-1 ring-nv-accent/0 group-hover:ring-nv-accent/50 transition-all pointer-events-none z-10" />
      )}

      {/* ── Drag handle: above the element, only drag-zone, no text conflict ── */}
      {isSelect && (
        <div
          className="absolute left-0 right-0 flex justify-center items-end cursor-grab active:cursor-grabbing z-20"
          style={{ top: -22, height: 22, paddingBottom: 3 }}
          onMouseDown={startDrag}
        >
          <div className="px-2 py-0.5 bg-nv-sidebar border border-white/[0.08] rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center shadow-elevation-1">
            <GripHorizontal size={11} className="text-nv-text-tertiary" />
          </div>
        </div>
      )}

      {/* ── Delete button: same Trash2 for ALL element types ── */}
      {isSelect && (
        <button
          onClick={(e) => { e.stopPropagation(); removeElement(el.id); }}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-nv-danger flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-30 hover:scale-110 shadow-elevation-1"
        >
          <Trash2 size={9} className="text-white" />
        </button>
      )}

      {/* ── Sticky note ── */}
      {el.type === 'sticky' && (
        <div
          className="w-full h-full p-3 shadow-elevation-2 relative overflow-hidden"
          style={{ backgroundColor: el.color, borderRadius: 6, color: '#1a1a1a' }}
        >
          <textarea
            autoFocus
            value={el.content}
            onFocus={(e) => e.target.select()}
            onChange={(e) => updateElement(el.id, { content: e.target.value })}
            className="w-full h-full bg-transparent border-none outline-none resize-none font-medium leading-snug text-sm placeholder:text-black/30 cursor-text"
          />
        </div>
      )}

      {/* ── Text ── */}
      {el.type === 'text' && (
        <textarea
          ref={textareaRef}
          autoFocus
          value={el.content}
          onFocus={(e) => e.target.select()}
          onChange={(e) => updateElement(el.id, { content: e.target.value })}
          className="w-full bg-transparent border-none outline-none resize-none px-1 py-0.5 placeholder:text-white/20 min-h-[1.5em] overflow-hidden cursor-text"
          style={{ color: el.color, width: el.width ? `${el.width}px` : 'auto' }}
        />
      )}

      {/* ── Image ── */}
      {el.type === 'image' && (
        <div className="w-full h-full relative shadow-elevation-2 rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03]">
          <img src={el.content} alt="" className="w-full h-full object-contain pointer-events-none" />
        </div>
      )}

      {/* ── Shape ── */}
      {el.type === 'shape' && (
        <div
          className="w-full h-full"
          style={{ border: `2px solid ${el.color}`, borderRadius: el.shape === 'circle' ? '50%' : 8 }}
        />
      )}

      {/* Resize handle */}
      {isSelect && (
        <div
          onMouseDown={startResize}
          className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center bg-nv-accent rounded-tl z-30"
        >
          <Maximize2 size={7} className="text-white" />
        </div>
      )}
    </div>
  );
}

/* ── Toolbar Button ── */
function ToolbarButton({ active, icon, onClick, label }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all relative group ${
        active
          ? 'bg-nv-accent/20 text-nv-accent ring-1 ring-nv-accent/30'
          : 'text-nv-text-tertiary hover:bg-white/[0.06] hover:text-nv-text-primary'
      }`}
    >
      {icon}
      <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-1 bg-nv-sidebar border border-white/[0.08] text-[10px] text-nv-text-secondary rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-elevation-2">
        {label}
      </span>
    </button>
  );
}
