import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Trash2, FileText, Pin,
  MousePointer2, Pencil, Type, Image as ImageIcon,
  StickyNote, Square, Circle, ArrowRight,
  ChevronLeft, ChevronRight, Download, Upload,
  Layers, Palette, Type as FontIcon, Move
} from 'lucide-react';
import { nanoid } from 'nanoid';

const NOTES_KEY = 'nv_whiteboard_notes';

// Helper to load notes from localStorage
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

// Helper to save notes to localStorage
function saveNotes(notes) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch { }
}

// Helper to create a new whiteboard note
function createNote() {
  return {
    id: `wb_${Date.now()}_${nanoid(6)}`,
    title: '',
    elements: [],
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

export default function WhiteboardApp() {
  const [notes, setNotes] = useState(() => loadNotes());
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [tool, setTool] = useState('select'); // select, draw, text, sticky, shape, image
  const [color, setColor] = useState('#6366f1');
  const [saveIndicator, setSaveIndicator] = useState(false);

  // Canvas State
  const [viewState, setViewState] = useState({ x: 0, y: 0, zoom: 1 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [currentPath, setCurrentPath] = useState(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const saveTimer = useRef(null);

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
      ? notes.filter((n) => n.title.toLowerCase().includes(q))
      : [...notes];

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
      if (selectedId === id) {
        setSelectedId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
  }, [selectedId]);

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

    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveIndicator(true);
      setTimeout(() => setSaveIndicator(false), 1200);
    }, 400);
  }, []);

  // --- Whiteboard Logic ---

  const handleMouseDown = (e) => {
    if (!selectedNote) return;

    // Middle click or Space/Alt + Left click for panning
    if (e.button === 1 || tool === 'select' || e.altKey) {
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - viewState.x) / viewState.zoom;
    const y = (e.clientY - rect.top - viewState.y) / viewState.zoom;

    if (tool === 'draw') {
      setIsDrawing(true);
      setCurrentPath({
        id: nanoid(),
        type: 'draw',
        points: [[x, y]],
        color,
        strokeWidth: 3
      });
    } else if (tool === 'text' || tool === 'sticky') {
      const newElement = {
        id: nanoid(),
        type: tool,
        x,
        y,
        width: tool === 'sticky' ? 150 : 200,
        height: tool === 'sticky' ? 150 : 40,
        content: tool === 'sticky' ? 'Take a note...' : 'Type something...',
        color: tool === 'sticky' ? '#fde047' : color,
        textColor: '#000000',
      };
      updateNote(selectedId, { elements: [...selectedNote.elements, newElement] });
      setTool('select');
    } else if (tool === 'shape') {
      const newElement = {
        id: nanoid(),
        type: 'shape',
        shape: 'rect',
        x,
        y,
        width: 100,
        height: 100,
        color,
      };
      updateNote(selectedId, { elements: [...selectedNote.elements, newElement] });
      setTool('select');
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setViewState(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!isDrawing || tool !== 'draw') return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - viewState.x) / viewState.zoom;
    const y = (e.clientY - rect.top - viewState.y) / viewState.zoom;

    setCurrentPath(prev => ({
      ...prev,
      points: [...prev.points, [x, y]]
    }));
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    if (isDrawing && currentPath) {
      updateNote(selectedId, {
        elements: [...selectedNote.elements, currentPath]
      });
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

    const zoomStep = 1.1;
    const factor = e.deltaY < 0 ? zoomStep : 1 / zoomStep;
    const newZoom = Math.min(Math.max(viewState.zoom * factor, 0.1), 5);

    // Calculate new offset to keep mouse point fixed
    const dx = (mouseX - viewState.x) * (1 - factor);
    const dy = (mouseY - viewState.y) * (1 - factor);

    setViewState({
      x: viewState.x + dx,
      y: viewState.y + dy,
      zoom: newZoom
    });
  };

  const updateElement = (id, fields) => {
    const newElements = selectedNote.elements.map(el =>
      el.id === id ? { ...el, ...fields } : el
    );
    updateNote(selectedId, { elements: newElements });
  };

  const removeElement = (id) => {
    updateNote(selectedId, {
      elements: selectedNote.elements.filter(el => el.id !== id)
    });
  };

  return (
    <div className="flex h-full overflow-hidden bg-nv-bg">
      {/* Sidebar */}
      <div className="w-[280px] shrink-0 border-r border-white/[0.06] flex flex-col bg-nv-sidebar/60 backdrop-blur-xl">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-nv-text-primary">Whiteboards</h1>
            <button
              onClick={createNewNote}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-nv-accent text-white hover:bg-nv-accent-hover transition-all"
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-nv-text-tertiary" />
            <input
              type="text"
              placeholder="Search boards..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/[0.07] rounded-xl pl-9 pr-4 py-2 text-sm text-nv-text-primary placeholder-nv-text-tertiary outline-none focus:border-nv-accent/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {filteredNotes.map((note) => (
            <button
              key={note.id}
              onClick={() => setSelectedId(note.id)}
              className={`w-full text-left px-3 py-3 rounded-xl transition-all group relative ${selectedId === note.id
                ? 'bg-nv-accent/10 border border-nv-accent/20'
                : 'hover:bg-white/[0.03] border border-transparent'
                }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-medium truncate ${selectedId === note.id ? 'text-nv-accent' : 'text-nv-text-secondary'}`}>
                  {note.title || 'Untitled Board'}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Pin
                    size={12}
                    className={note.pinned ? 'text-nv-accent' : 'text-nv-text-tertiary hover:text-nv-accent'}
                    onClick={(e) => { e.stopPropagation(); togglePin(note.id); }}
                  />
                  <Trash2
                    size={12}
                    className="text-nv-text-tertiary hover:text-nv-danger"
                    onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-nv-text-tertiary">
                <span>{note.elements.length} elements</span>
                <span>{formatDate(note.updatedAt)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-[#121212]">
        {selectedNote ? (
          <>
            {/* Header / Title Input */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-full max-w-md px-4">
              <div className="bg-[#1e1e1e]/80 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-2 flex items-center gap-3 shadow-2xl">
                <input
                  type="text"
                  value={selectedNote.title}
                  onChange={(e) => updateNote(selectedId, { title: e.target.value })}
                  placeholder="Untitled Board"
                  className="flex-1 bg-transparent text-sm font-semibold text-nv-text-primary outline-none text-center"
                />
                <AnimatePresence>
                  {saveIndicator && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="w-2 h-2 rounded-full bg-nv-accent shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                    />
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Canvas Area */}
            <div
              ref={containerRef}
              className={`flex-1 relative overflow-hidden ${isPanning ? 'cursor-grabbing' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            >
              <svg
                ref={canvasRef}
                className="w-full h-full"
                style={{
                  backgroundColor: '#121212',
                  backgroundImage: `radial-gradient(circle, #222 1px, transparent 1px)`,
                  backgroundSize: '30px 30px',
                  backgroundPosition: `${viewState.x}px ${viewState.y}px`
                }}
              >
                <g transform={`translate(${viewState.x}, ${viewState.y}) scale(${viewState.zoom})`}>
                  {/* Render Drawing Paths */}
                  {selectedNote.elements.filter(el => el.type === 'draw').map(path => (
                    <polyline
                      key={path.id}
                      points={path.points.map(p => p.join(',')).join(' ')}
                      fill="none"
                      stroke={path.color}
                      strokeWidth={path.strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}

                  {/* Active Drawing Path */}
                  {currentPath && (
                    <polyline
                      points={currentPath.points.map(p => p.join(',')).join(' ')}
                      fill="none"
                      stroke={currentPath.color}
                      strokeWidth={currentPath.strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </g>
              </svg>

              {/* Render HTML elements (Text, Sticky, Shapes) */}
              <div
                className="absolute inset-0 pointer-events-none overflow-hidden"
                style={{ transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.zoom})` }}
              >
                {selectedNote.elements.map(el => {
                  if (el.type === 'draw') return null;

                  return (
                    <motion.div
                      drag
                      dragMomentum={false}
                      onDragEnd={(_, info) => {
                        updateElement(el.id, {
                          x: el.x + info.offset.x / viewState.zoom,
                          y: el.y + info.offset.y / viewState.zoom
                        });
                      }}
                      initial={false}
                      className="absolute pointer-events-auto"
                      style={{
                        left: el.x,
                        top: el.y,
                        width: el.width,
                        height: el.height,
                        zIndex: tool === 'select' ? 50 : 1
                      }}
                    >
                      {el.type === 'sticky' && (
                        <div
                          className="w-full h-full p-4 shadow-xl border-t-4 rotate-1"
                          style={{
                            backgroundColor: el.color,
                            borderColor: 'rgba(0,0,0,0.1)',
                            color: '#1a1a1a',
                            borderRadius: '2px'
                          }}
                        >
                          <textarea
                            value={el.content}
                            onChange={(e) => updateElement(el.id, { content: e.target.value })}
                            className="w-full h-full bg-transparent border-none outline-none resize-none font-medium leading-tight text-sm placeholder:text-black/20"
                          />
                          <button
                            onClick={() => removeElement(el.id)}
                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-nv-danger text-white flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                          >
                            <Plus className="rotate-45" size={14} />
                          </button>
                        </div>
                      )}

                      {el.type === 'text' && (
                        <div className="relative group min-w-[50px]">
                          <textarea
                            value={el.content}
                            onChange={(e) => updateElement(el.id, { content: e.target.value })}
                            className="w-full bg-transparent border-none outline-none resize-none text-nv-text-primary px-2 py-1 placeholder:text-white/20"
                            style={{ color: el.color, fontStyle: 'Inter' }}
                          />
                          <button
                            onClick={() => removeElement(el.id)}
                            className="absolute -top-6 left-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={14} className="text-nv-danger" />
                          </button>
                        </div>
                      )}

                      {el.type === 'image' && (
                        <div className="w-full h-full relative group shadow-lg rounded-lg overflow-hidden border border-white/10 bg-white/5">
                          <img
                            src={el.content}
                            alt="Board Element"
                            className="w-full h-full object-contain pointer-events-none"
                            onError={(e) => { e.target.src = 'https://via.placeholder.com/300x200?text=Invalid+URL'; }}
                          />
                          <button
                            onClick={() => removeElement(el.id)}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-nv-danger rounded-full p-1.5 shadow-xl"
                          >
                            <Plus className="rotate-45 text-white" size={14} />
                          </button>
                        </div>
                      )}

                      {el.type === 'shape' && (
                        <div
                          className="w-full h-full relative group"
                          style={{
                            border: `2px solid ${el.color}`,
                            borderRadius: el.shape === 'circle' ? '50%' : '8px'
                          }}
                        >
                          <button
                            onClick={() => removeElement(el.id)}
                            className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-nv-danger rounded-full p-1"
                          >
                            <Plus className="rotate-45 text-white" size={12} />
                          </button>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Toolbar */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50">
              <div className="bg-[#1e1e1e]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex items-center gap-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <ToolbarButton active={tool === 'select'} icon={<MousePointer2 size={20} />} onClick={() => setTool('select')} label="Select" />
                <ToolbarButton active={tool === 'draw'} icon={<Pencil size={20} />} onClick={() => setTool('draw')} label="Draw" />
                <ToolbarButton active={tool === 'text'} icon={<Type size={20} />} onClick={() => setTool('text')} label="Text" />
                <ToolbarButton active={tool === 'sticky'} icon={<StickyNote size={20} />} onClick={() => setTool('sticky')} label="Sticky" />
                <ToolbarButton active={tool === 'shape'} icon={<Square size={20} />} onClick={() => setTool('shape')} label="Shapes" />
                <ToolbarButton active={tool === 'image'} icon={<ImageIcon size={20} />} onClick={() => setTool('image')} label="Images" />

                <div className="w-px h-8 bg-white/10 mx-2" />

                <div className="flex items-center gap-1.5 px-2">
                  {['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ffffff'].map(c => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <div className="w-24 h-24 rounded-[40px] bg-nv-accent/10 flex items-center justify-center animate-pulse">
              <Layers size={48} className="text-nv-accent" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-nv-text-primary mb-2">Initialize Canvas</h2>
              <p className="text-nv-text-tertiary">Select a board or create a new whiteboard to start creating.</p>
            </div>
            <button
              onClick={createNewNote}
              className="px-6 py-3 rounded-2xl bg-nv-accent text-white font-semibold hover:bg-nv-accent-hover transition-all flex items-center gap-2"
            >
              <Plus size={20} />
              New Whiteboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({ active, icon, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all relative group ${active
        ? 'bg-nv-accent text-white shadow-lg shadow-nv-accent/20'
        : 'text-nv-text-tertiary hover:bg-white/5 hover:text-nv-text-primary'
        }`}
    >
      {icon}
      <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-[10px] text-white rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/5">
        {label}
      </span>
    </button>
  );
}

