import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Download, Users, MousePointer2, Pencil, Type,
  StickyNote, Square, Trash2, GripHorizontal, Check,
  ChevronDown, PenLine,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

const WB_W = 3000;
const WB_H = 2200;
const WB_PALETTE = ['#34C759', '#0A84FF', '#BF5AF2', '#FF9F0A', '#FF3B30', '#ffffff'];
const WB_STORAGE_KEY = (channelId) => `nv_wb_${channelId}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function pointsToD(pts) {
  if (!pts || pts.length < 2) return '';
  const [[fx, fy], ...rest] = pts;
  return `M ${fx} ${fy} ` + rest.map(([x, y]) => `L ${x} ${y}`).join(' ');
}

function clampPan(px, py, zoom, cW, cH) {
  const m = 100;
  return {
    x: clamp(px, m - WB_W * zoom, cW - m),
    y: clamp(py, m - WB_H * zoom, cH - m),
  };
}

function exportToSvg(elements, strokes) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const strokesSvg = strokes.map((s) => {
    if (!s.points?.length) return '';
    return `<path d="${pointsToD(s.points)}" stroke="${esc(s.color || '#fff')}" stroke-width="${s.width || 3}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');

  const elsSvg = elements.map((el) => {
    if (el.type === 'text') {
      return `<foreignObject x="${el.x}" y="${el.y}" width="${el.w || 220}" height="${el.h || 120}"><body xmlns="http://www.w3.org/1999/xhtml"><div style="color:${esc(el.color || '#fff')};font-size:15px;font-family:sans-serif;white-space:pre-wrap;word-break:break-word">${esc(el.content)}</div></body></foreignObject>`;
    }
    if (el.type === 'sticky') {
      return `<rect x="${el.x}" y="${el.y}" width="${el.w || 180}" height="${el.h || 150}" fill="${esc(el.color || '#FF9F0A')}33" rx="8" stroke="${esc(el.color || '#FF9F0A')}66" stroke-width="1"/><foreignObject x="${el.x + 8}" y="${el.y + 8}" width="${(el.w || 180) - 16}" height="${(el.h || 150) - 16}"><body xmlns="http://www.w3.org/1999/xhtml"><div style="color:#fff;font-size:13px;font-family:sans-serif;white-space:pre-wrap;word-break:break-word">${esc(el.content)}</div></body></foreignObject>`;
    }
    if (el.type === 'shape') {
      return `<rect x="${el.x}" y="${el.y}" width="${el.w || 120}" height="${el.h || 80}" fill="none" stroke="${esc(el.color || '#fff')}" stroke-width="2" rx="4"/>`;
    }
    if (el.type === 'image' && el.src) {
      return `<image x="${el.x}" y="${el.y}" width="${el.w || 200}" height="${el.h || 150}" href="${esc(el.src)}" preserveAspectRatio="xMidYMid meet"/>`;
    }
    return '';
  }).join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WB_W}" height="${WB_H}">
  <rect width="${WB_W}" height="${WB_H}" fill="#111111"/>
  ${strokesSvg}
  ${elsSvg}
</svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'whiteboard.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Remote cursor ─────────────────────────────────────────────────────────────

function RemoteCursor({ udata, zoom, pan }) {
  if (!udata.cursor) return null;
  const sx = udata.cursor.x * zoom + pan.x;
  const sy = udata.cursor.y * zoom + pan.y;
  return (
    <div className="pointer-events-none absolute z-40" style={{ left: sx, top: sy, transform: 'translate(-2px,-2px)' }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M2 2L14 7L8 9L6 15L2 2Z" fill={udata.color} stroke="#000" strokeWidth="0.8" strokeLinejoin="round" />
      </svg>
      <span className="ml-1 text-[10px] font-semibold px-1 py-0.5 rounded-sm text-white shadow" style={{ background: udata.color, position: 'absolute', top: 16, left: 2, whiteSpace: 'nowrap' }}>
        {udata.name}
      </span>
    </div>
  );
}

// ── Board element ─────────────────────────────────────────────────────────────

function BoardElement({ el, zoom, tool, canDraw, selectedId, setSelectedId, onUpdate, onDelete, onCommitDrag }) {
  const isSelected = selectedId === el.id;
  const dragRef = useRef(null);

  const startDrag = useCallback((e) => {
    if (e.button !== 0 || tool !== 'select' || !canDraw) return;
    e.preventDefault();
    e.stopPropagation();
    const origX = el.x, origY = el.y;
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const onMove = (mv) => {
      moved = true;
      onUpdate({ ...el, x: origX + (mv.clientX - startX) / zoom, y: origY + (mv.clientY - startY) / zoom });
    };
    const onUp = () => {
      if (moved) onCommitDrag({ ...el });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [el, tool, zoom, canDraw, onUpdate, onCommitDrag]);

  const base = { position: 'absolute', left: el.x, top: el.y, width: el.w || 'auto', height: el.h || 'auto' };

  if (el.type === 'image') {
    return (
      <div className="group absolute" style={{ ...base, pointerEvents: tool === 'select' ? 'auto' : 'none' }}
        onMouseDown={startDrag} onClick={() => setSelectedId(el.id)}>
        <img src={el.src} alt="" style={{ width: el.w || 200, height: el.h || 150, display: 'block', borderRadius: 4, border: isSelected ? `2px solid ${WB_PALETTE[0]}` : '2px solid transparent' }} draggable={false} />
        {isSelected && canDraw && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(el.id); }} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-nv-danger flex items-center justify-center opacity-0 group-hover:opacity-100 z-30 hover:scale-110 shadow">
            <Trash2 size={9} className="text-white" />
          </button>
        )}
      </div>
    );
  }

  if (el.type === 'text') {
    return (
      <div className="group absolute" style={{ ...base, minWidth: 80, pointerEvents: tool === 'select' ? 'auto' : 'none' }}
        onMouseDown={startDrag} onClick={() => setSelectedId(el.id)}>
        {isSelected && (
          <div className="absolute left-0 right-0 flex justify-center items-end cursor-grab z-20" style={{ top: -22, height: 22, paddingBottom: 3 }}>
            <div className="px-2 py-0.5 bg-nv-sidebar border border-white/[0.08] rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center shadow">
              <GripHorizontal size={11} className="text-nv-text-tertiary" />
            </div>
          </div>
        )}
        <textarea
          defaultValue={el.content}
          onBlur={(e) => { if (canDraw) onUpdate({ ...el, content: e.target.value }); }}
          readOnly={!canDraw}
          className="bg-transparent resize-none outline-none border-none text-sm leading-relaxed"
          style={{ color: el.color || '#fff', width: el.w || 180, height: el.h || 80, minWidth: 80, minHeight: 40 }}
          onClick={(e) => e.stopPropagation()}
        />
        {isSelected && canDraw && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(el.id); }} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-nv-danger flex items-center justify-center opacity-0 group-hover:opacity-100 z-30 hover:scale-110 shadow">
            <Trash2 size={9} className="text-white" />
          </button>
        )}
      </div>
    );
  }

  if (el.type === 'sticky') {
    return (
      <div className="group absolute rounded-xl" style={{ ...base, width: el.w || 180, height: el.h || 150, background: `${el.color || '#FF9F0A'}22`, border: `1.5px solid ${el.color || '#FF9F0A'}55`, pointerEvents: tool === 'select' ? 'auto' : 'none' }}
        onMouseDown={startDrag} onClick={() => setSelectedId(el.id)}>
        <div className="absolute left-0 right-0 flex justify-center items-end cursor-grab z-20" style={{ top: -22, height: 22, paddingBottom: 3 }}>
          <div className="px-2 py-0.5 bg-nv-sidebar border border-white/[0.08] rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center shadow">
            <GripHorizontal size={11} className="text-nv-text-tertiary" />
          </div>
        </div>
        <textarea
          defaultValue={el.content}
          onBlur={(e) => { if (canDraw) onUpdate({ ...el, content: e.target.value }); }}
          readOnly={!canDraw}
          className="bg-transparent resize-none outline-none border-none text-xs leading-relaxed p-3 w-full h-full"
          style={{ color: '#fff' }}
          onClick={(e) => e.stopPropagation()}
        />
        {canDraw && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(el.id); }} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-nv-danger flex items-center justify-center opacity-0 group-hover:opacity-100 z-30 hover:scale-110 shadow">
            <Trash2 size={9} className="text-white" />
          </button>
        )}
      </div>
    );
  }

  if (el.type === 'shape') {
    return (
      <div className="group absolute" style={{ ...base, width: el.w || 120, height: el.h || 80, border: `2px solid ${el.color || '#fff'}`, borderRadius: 6, pointerEvents: tool === 'select' ? 'auto' : 'none' }}
        onMouseDown={startDrag} onClick={() => setSelectedId(el.id)}>
        <div className="absolute left-0 right-0 flex justify-center items-end cursor-grab z-20" style={{ top: -22, height: 22, paddingBottom: 3 }}>
          <div className="px-2 py-0.5 bg-nv-sidebar border border-white/[0.08] rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center shadow">
            <GripHorizontal size={11} className="text-nv-text-tertiary" />
          </div>
        </div>
        {canDraw && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(el.id); }} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-nv-danger flex items-center justify-center opacity-0 group-hover:opacity-100 z-30 hover:scale-110 shadow">
            <Trash2 size={9} className="text-white" />
          </button>
        )}
      </div>
    );
  }
  return null;
}

// ── Permissions dropdown ──────────────────────────────────────────────────────

function PermissionsDropdown({ voiceParticipants, permissions, creatorId, userId, onSet, onClose }) {
  return (
    <div className="absolute right-0 top-full mt-1 w-64 bg-nv-sidebar border border-white/[0.1] rounded-xl shadow-elevation-3 z-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-white/[0.06] text-[10px] uppercase tracking-widest text-nv-text-tertiary font-semibold">
        Drawing Permissions
      </div>
      <div className="max-h-56 overflow-y-auto">
        {voiceParticipants.filter((p) => p.id !== userId).map((p) => {
          const blocked = permissions[p.id] === false;
          const isCreator = p.id === creatorId;
          return (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.04] transition-colors">
              <div className="w-6 h-6 rounded-full bg-nv-channels flex items-center justify-center text-[10px] text-nv-text-secondary font-bold flex-shrink-0">
                {(p.display_name || p.username || '?')[0].toUpperCase()}
              </div>
              <span className="text-xs text-nv-text-primary flex-1 truncate">
                {p.display_name || p.username}
                {isCreator && <span className="ml-1 text-nv-accent text-[10px]">Host</span>}
              </span>
              {!isCreator && (
                <button
                  onClick={() => onSet(p.id, blocked)}
                  className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${blocked ? 'border-nv-danger/50 bg-nv-danger/15' : 'border-nv-accent/50 bg-nv-accent/15'}`}
                  title={blocked ? 'Allow drawing' : 'Block drawing'}
                >
                  {!blocked && <Check size={10} className="text-nv-accent" />}
                  {blocked && <X size={10} className="text-nv-danger" />}
                </button>
              )}
            </div>
          );
        })}
        {voiceParticipants.filter((p) => p.id !== userId).length === 0 && (
          <div className="px-3 py-4 text-xs text-nv-text-tertiary text-center">No other users in channel</div>
        )}
      </div>
    </div>
  );
}

// ── Full-screen overlay ───────────────────────────────────────────────────────

function WbOverlay({
  channelId, userId, socket,
  elements, strokes, permissions, activeUsers, creatorId,
  voiceParticipants,
  onClose, onElementAdd, onElementUpdate, onElementDelete, onStrokeAdd, onClear, onPermissionSet,
}) {
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState('#34C759');
  const [pan, setPan] = useState({ x: 100, y: 80 });
  const [zoom, setZoom] = useState(0.35);
  const [drawPts, setDrawPts] = useState(null);
  const [shapeStart, setShapeStart] = useState(null);
  const [shapeCurrent, setShapeCurrent] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showPerms, setShowPerms] = useState(false);

  const canvasRef = useRef(null);
  const zoomRef = useRef(0.35);
  const panRef = useRef({ x: 100, y: 80 });
  const spaceRef = useRef(false);
  const panDragRef = useRef(null);
  const cursorTRef = useRef(0);
  const isHost = userId === creatorId;
  const canDraw = isHost || permissions[userId] !== false;

  // Keep refs in sync
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  const screenToCanvas = useCallback((sx, sy) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (sx - rect.left - panRef.current.x) / zoomRef.current,
      y: (sy - rect.top - panRef.current.y) / zoomRef.current,
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        spaceRef.current = true;
        e.preventDefault();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
          onElementDelete(selectedId);
          setSelectedId(null);
        }
      }
      if (e.key === 'Escape') onClose();
    };
    const onKeyUp = (e) => { if (e.code === 'Space') spaceRef.current = false; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, [selectedId, onElementDelete, onClose]);

  // Paste images
  useEffect(() => {
    const onPaste = (e) => {
      if (!canDraw) return;
      const items = [...(e.clipboardData?.items || [])];
      const imgItem = items.find((i) => i.type.startsWith('image/'));
      if (imgItem) {
        const file = imgItem.getAsFile();
        const reader = new FileReader();
        reader.onload = (ev) => {
          const el = { id: nanoid(), type: 'image', x: 200 / zoomRef.current, y: 100 / zoomRef.current, w: 300, h: 200, src: ev.target.result };
          onElementAdd(el);
        };
        reader.readAsDataURL(file);
      } else {
        const text = e.clipboardData?.getData('text');
        if (text?.trim()) {
          const el = { id: nanoid(), type: 'text', x: 200 / zoomRef.current, y: 100 / zoomRef.current, w: 220, h: 100, content: text.trim(), color: '#ffffff' };
          onElementAdd(el);
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [canDraw, onElementAdd]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = clamp(zoomRef.current * delta, 0.08, 4);
    const scale = newZoom / zoomRef.current;
    const newPan = clampPan(
      mouseX - (mouseX - panRef.current.x) * scale,
      mouseY - (mouseY - panRef.current.y) * scale,
      newZoom, rect.width, rect.height
    );
    setZoom(newZoom);
    setPan(newPan);
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault();
      panDragRef.current = { startX: e.clientX, startY: e.clientY, origPan: { ...panRef.current } };
      return;
    }
    if (e.button !== 0 || !canDraw) return;
    const pos = screenToCanvas(e.clientX, e.clientY);

    if (tool === 'draw') {
      e.preventDefault();
      setDrawPts([[pos.x, pos.y]]);
      return;
    }
    if (tool === 'shape') {
      e.preventDefault();
      setShapeStart(pos);
      setShapeCurrent(pos);
      return;
    }
    if (tool === 'text') {
      const el = { id: nanoid(), type: 'text', x: pos.x, y: pos.y, w: 220, h: 80, content: '', color };
      onElementAdd(el);
      setTool('select');
      return;
    }
    if (tool === 'sticky') {
      const el = { id: nanoid(), type: 'sticky', x: pos.x, y: pos.y, w: 180, h: 140, content: '', color };
      onElementAdd(el);
      setTool('select');
      return;
    }
    if (tool === 'select') {
      setSelectedId(null);
    }
  }, [tool, canDraw, color, screenToCanvas, onElementAdd]);

  const handleMouseMove = useCallback((e) => {
    // Pan drag
    if (panDragRef.current) {
      const { startX, startY, origPan } = panDragRef.current;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const newPan = clampPan(origPan.x + e.clientX - startX, origPan.y + e.clientY - startY, zoomRef.current, rect.width, rect.height);
        setPan(newPan);
      }
      return;
    }
    // Cursor throttle
    const now = Date.now();
    if (now - cursorTRef.current > 40) {
      cursorTRef.current = now;
      const pos = screenToCanvas(e.clientX, e.clientY);
      socket?.emit('whiteboard:cursor', { channelId, x: pos.x, y: pos.y });
    }
    // Drawing
    if (drawPts) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      setDrawPts((prev) => [...prev, [pos.x, pos.y]]);
    }
    // Shape preview
    if (shapeStart) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      setShapeCurrent(pos);
    }
  }, [socket, channelId, drawPts, shapeStart, screenToCanvas]);

  const handleMouseUp = useCallback((e) => {
    if (panDragRef.current) { panDragRef.current = null; return; }
    if (drawPts && drawPts.length >= 2) {
      onStrokeAdd({ id: nanoid(), points: drawPts, color, width: 3 });
    }
    setDrawPts(null);
    if (shapeStart && shapeCurrent) {
      const x = Math.min(shapeStart.x, shapeCurrent.x);
      const y = Math.min(shapeStart.y, shapeCurrent.y);
      const w = Math.abs(shapeCurrent.x - shapeStart.x);
      const h = Math.abs(shapeCurrent.y - shapeStart.y);
      if (w > 4 && h > 4) {
        const el = { id: nanoid(), type: 'shape', x, y, w, h, color };
        onElementAdd(el);
      }
    }
    setShapeStart(null);
    setShapeCurrent(null);
  }, [drawPts, shapeStart, shapeCurrent, color, onStrokeAdd, onElementAdd]);

  const getCursor = () => {
    if (spaceRef.current || panDragRef.current) return 'grab';
    if (!canDraw) return 'default';
    if (tool === 'draw') return 'crosshair';
    if (tool === 'text' || tool === 'sticky') return 'text';
    return 'default';
  };

  const shapePreviewStyle = shapeStart && shapeCurrent ? {
    position: 'absolute',
    left: Math.min(shapeStart.x, shapeCurrent.x),
    top: Math.min(shapeStart.y, shapeCurrent.y),
    width: Math.abs(shapeCurrent.x - shapeStart.x),
    height: Math.abs(shapeCurrent.y - shapeStart.y),
    border: `2px solid ${color}`,
    borderRadius: 6,
    pointerEvents: 'none',
  } : null;

  const tools = [
    { id: 'select', icon: MousePointer2, label: 'Select (S)' },
    { id: 'draw', icon: Pencil, label: 'Draw (D)' },
    { id: 'text', icon: Type, label: 'Text (T)' },
    { id: 'sticky', icon: StickyNote, label: 'Sticky (N)' },
    { id: 'shape', icon: Square, label: 'Rectangle (R)' },
  ];

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 's') setTool('select');
      if (e.key === 'd') setTool('draw');
      if (e.key === 't') setTool('text');
      if (e.key === 'n') setTool('sticky');
      if (e.key === 'r') setTool('shape');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const wbActiveUsers = Object.entries(activeUsers).filter(([id]) => id !== userId);

  return (
    <div className="fixed inset-0 z-[9999] bg-[#111] flex flex-col select-none" style={{ fontFamily: 'inherit' }}>
      {/* Top bar */}
      <div className="h-11 flex items-center px-3 gap-2 border-b border-white/[0.07] bg-nv-sidebar shrink-0">
        <PenLine size={15} className="text-nv-accent shrink-0" />
        <span className="text-sm font-semibold text-nv-text-primary">Voice Whiteboard</span>

        {/* Active users */}
        <div className="flex items-center gap-1 ml-2">
          {Object.entries(activeUsers).slice(0, 6).map(([id, u]) => (
            <div key={id} title={u.name} style={{ background: u.color }} className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0 border-2 border-nv-sidebar">
              {u.name?.[0]?.toUpperCase() || '?'}
            </div>
          ))}
          {Object.keys(activeUsers).length > 6 && (
            <span className="text-[10px] text-nv-text-tertiary">+{Object.keys(activeUsers).length - 6}</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Host: clear board */}
          {isHost && (
            <button onClick={() => { if (window.confirm('Clear the whiteboard?')) onClear(); }} className="h-7 px-2.5 text-xs rounded-lg border border-nv-danger/30 text-nv-danger hover:bg-nv-danger/15 transition-colors">
              Clear
            </button>
          )}

          {/* Host: permissions */}
          {isHost && (
            <div className="relative">
              <button
                onClick={() => setShowPerms((v) => !v)}
                className="h-7 px-2.5 text-xs rounded-lg border border-white/[0.1] text-nv-text-secondary hover:bg-white/[0.06] transition-colors flex items-center gap-1"
              >
                <Users size={12} />
                <span>Users</span>
                <ChevronDown size={10} className={`transition-transform ${showPerms ? 'rotate-180' : ''}`} />
              </button>
              {showPerms && (
                <PermissionsDropdown
                  voiceParticipants={voiceParticipants}
                  permissions={permissions}
                  creatorId={creatorId}
                  userId={userId}
                  onSet={(targetId, currentlyBlocked) => onPermissionSet(targetId, currentlyBlocked)}
                  onClose={() => setShowPerms(false)}
                />
              )}
            </div>
          )}

          {/* Export */}
          <button
            onClick={() => exportToSvg(elements, strokes)}
            className="h-7 px-2.5 text-xs rounded-lg border border-white/[0.1] text-nv-text-secondary hover:bg-white/[0.06] transition-colors flex items-center gap-1"
            title="Export as SVG"
          >
            <Download size={12} />
            <span>Export</span>
          </button>

          {/* Close */}
          <button onClick={onClose} className="w-7 h-7 rounded-lg border border-white/[0.1] text-nv-text-secondary hover:bg-white/[0.06] flex items-center justify-center transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left toolbar */}
        <div className="w-11 shrink-0 bg-nv-sidebar border-r border-white/[0.06] flex flex-col items-center py-2.5 gap-1">
          {tools.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${tool === t.id ? 'bg-nv-accent/20 text-nv-accent border border-nv-accent/30' : 'text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06] border border-transparent'}`}
            >
              <t.icon size={15} />
            </button>
          ))}

          <div className="w-6 h-px bg-white/[0.08] my-1" />

          {/* Color palette */}
          {WB_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{ background: c }}
              className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-nv-sidebar scale-110' : ''}`}
            />
          ))}

          {/* Not allowed indicator */}
          {!canDraw && (
            <>
              <div className="w-6 h-px bg-white/[0.08] my-1" />
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" title="View only">
                <span className="text-[10px] text-nv-danger">🔒</span>
              </div>
            </>
          )}
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 overflow-hidden relative bg-[#111]"
          style={{ cursor: getCursor() }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onClick={() => setShowPerms(false)}
        >
          {/* Transformed canvas */}
          <div style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', width: WB_W, height: WB_H, position: 'absolute' }}>
            {/* Artboard background */}
            <div style={{ position: 'absolute', inset: 0, background: '#1a1a1a', borderRadius: 4 }}>
              {/* Dot grid */}
              <svg width={WB_W} height={WB_H} style={{ position: 'absolute', inset: 0, opacity: 0.3 }}>
                <defs>
                  <pattern id="wbgrid" width="30" height="30" patternUnits="userSpaceOnUse">
                    <circle cx="15" cy="15" r="1" fill="#555" />
                  </pattern>
                </defs>
                <rect width={WB_W} height={WB_H} fill="url(#wbgrid)" />
              </svg>
            </div>

            {/* SVG strokes layer */}
            <svg width={WB_W} height={WB_H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {strokes.map((s) => (
                <path key={s.id} d={pointsToD(s.points)} stroke={s.color || '#fff'} strokeWidth={s.width || 3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {/* Live drawing */}
              {drawPts && drawPts.length >= 2 && (
                <path d={pointsToD(drawPts)} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>

            {/* Elements layer */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
              {elements.map((el) => (
                <BoardElement
                  key={el.id}
                  el={el}
                  zoom={zoom}
                  tool={tool}
                  canDraw={canDraw}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  onUpdate={(updated) => onElementUpdate(updated)}
                  onDelete={onElementDelete}
                  onCommitDrag={(updated) => onElementUpdate(updated)}
                />
              ))}
              {/* Shape preview */}
              {shapePreviewStyle && <div style={shapePreviewStyle} />}
            </div>
          </div>

          {/* Remote cursors (screen space) */}
          {wbActiveUsers.map(([id, udata]) => (
            <RemoteCursor key={id} udata={udata} zoom={zoom} pan={pan} />
          ))}

          {/* Zoom indicator */}
          <div className="absolute bottom-3 right-3 text-[10px] text-nv-text-tertiary bg-nv-sidebar/80 backdrop-blur px-2 py-1 rounded-lg border border-white/[0.06]">
            {Math.round(zoom * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main export component ─────────────────────────────────────────────────────

export default function VoiceWhiteboard({ channelId, voiceParticipants = [], isInChannel = false }) {
  const { socket } = useSocket();
  const { user } = useAuth();

  const [elements, setElements] = useState([]);
  const [strokes, setStrokes] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [activeUsers, setActiveUsers] = useState({});
  const [creatorId, setCreatorId] = useState(null);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  // Socket listeners — always active while in voice channel
  useEffect(() => {
    if (!socket) return;

    const onState = (data) => {
      setElements(data.elements || []);
      setStrokes(data.strokes || []);
      setPermissions(data.permissions || {});
      setActiveUsers(data.activeUsers || {});
      setCreatorId(data.creatorId || null);
    };
    const onElAdded = ({ element }) => setElements((p) => [...p, element]);
    const onElUpdated = ({ element }) => setElements((p) => p.map((e) => e.id === element.id ? element : e));
    const onElDeleted = ({ elementId }) => setElements((p) => p.filter((e) => e.id !== elementId));
    const onStroke = ({ stroke }) => setStrokes((p) => [...p, stroke]);
    const onCleared = () => { setElements([]); setStrokes([]); };
    const onPerms = ({ permissions: p }) => setPermissions(p);
    const onUsers = (users) => setActiveUsers((prev) => {
      const next = {};
      Object.entries(users).forEach(([id, udata]) => {
        next[id] = { ...udata, cursor: prev[id]?.cursor || null };
      });
      return next;
    });
    const onCursor = ({ userId, x, y }) => setActiveUsers((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], cursor: { x, y } },
    }));

    socket.on('whiteboard:state', onState);
    socket.on('whiteboard:element:added', onElAdded);
    socket.on('whiteboard:element:updated', onElUpdated);
    socket.on('whiteboard:element:deleted', onElDeleted);
    socket.on('whiteboard:stroke:added', onStroke);
    socket.on('whiteboard:cleared', onCleared);
    socket.on('whiteboard:permissions', onPerms);
    socket.on('whiteboard:users:update', onUsers);
    socket.on('whiteboard:cursor', onCursor);

    return () => {
      socket.off('whiteboard:state', onState);
      socket.off('whiteboard:element:added', onElAdded);
      socket.off('whiteboard:element:updated', onElUpdated);
      socket.off('whiteboard:element:deleted', onElDeleted);
      socket.off('whiteboard:stroke:added', onStroke);
      socket.off('whiteboard:cleared', onCleared);
      socket.off('whiteboard:permissions', onPerms);
      socket.off('whiteboard:users:update', onUsers);
      socket.off('whiteboard:cursor', onCursor);
    };
  }, [socket]);

  // Join/leave whiteboard session
  useEffect(() => {
    if (!socket || !channelId) return;
    if (isOverlayOpen) {
      socket.emit('whiteboard:join', { channelId });
    } else {
      socket.emit('whiteboard:leave', { channelId });
    }
  }, [isOverlayOpen, socket, channelId]);

  // Save to localStorage when overlay closes (host's device)
  useEffect(() => {
    if (!isOverlayOpen && creatorId === user?.id && (elements.length > 0 || strokes.length > 0)) {
      try { localStorage.setItem(WB_STORAGE_KEY(channelId), JSON.stringify({ elements, strokes })); } catch {}
    }
  }, [isOverlayOpen, creatorId, user?.id, channelId, elements, strokes]);

  // Socket emit helpers
  const handleElementAdd = useCallback((el) => socket?.emit('whiteboard:element:add', { channelId, element: el }), [socket, channelId]);
  const handleElementUpdate = useCallback((el) => socket?.emit('whiteboard:element:update', { channelId, element: el }), [socket, channelId]);
  const handleElementDelete = useCallback((id) => socket?.emit('whiteboard:element:delete', { channelId, elementId: id }), [socket, channelId]);
  const handleStrokeAdd = useCallback((stroke) => socket?.emit('whiteboard:stroke:add', { channelId, stroke }), [socket, channelId]);
  const handleClear = useCallback(() => socket?.emit('whiteboard:clear', { channelId }), [socket, channelId]);
  const handlePermissionSet = useCallback((targetId, currentlyBlocked) => {
    socket?.emit('whiteboard:permission:set', { channelId, targetUserId: targetId, canDraw: currentlyBlocked });
  }, [socket, channelId]);

  const activeCount = Object.keys(activeUsers).length;
  const hasSession = Boolean(creatorId);

  return (
    <>
      {/* Dock panel */}
      <div className="p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-nv-text-primary">
              {hasSession ? 'Active session' : 'No session'}
            </span>
            <span className="text-[10px] text-nv-text-tertiary">
              {hasSession ? `${activeCount} user${activeCount !== 1 ? 's' : ''} inside` : 'Start a shared whiteboard'}
            </span>
          </div>
          {isInChannel && (
            <button
              onClick={() => setIsOverlayOpen(true)}
              className="px-3 py-1.5 text-xs rounded-xl bg-nv-accent/15 text-nv-accent border border-nv-accent/25 hover:bg-nv-accent/25 transition-colors font-medium"
            >
              {hasSession ? 'Open' : 'Start'}
            </button>
          )}
        </div>

        {/* Active user avatars */}
        {activeCount > 0 && (
          <div className="flex items-center gap-1">
            {Object.entries(activeUsers).slice(0, 8).map(([id, udata]) => (
              <div key={id} style={{ background: udata.color }} title={udata.name} className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] text-white font-bold border-2 border-nv-bg shrink-0">
                {udata.name?.[0]?.toUpperCase() || '?'}
              </div>
            ))}
            {activeCount > 8 && <span className="text-[10px] text-nv-text-tertiary">+{activeCount - 8}</span>}
          </div>
        )}
      </div>

      {/* Full-screen overlay via portal */}
      {isOverlayOpen && createPortal(
        <WbOverlay
          channelId={channelId}
          userId={user?.id}
          socket={socket}
          elements={elements}
          strokes={strokes}
          permissions={permissions}
          activeUsers={activeUsers}
          creatorId={creatorId}
          voiceParticipants={voiceParticipants}
          onClose={() => setIsOverlayOpen(false)}
          onElementAdd={handleElementAdd}
          onElementUpdate={handleElementUpdate}
          onElementDelete={handleElementDelete}
          onStrokeAdd={handleStrokeAdd}
          onClear={handleClear}
          onPermissionSet={handlePermissionSet}
        />,
        document.body
      )}
    </>
  );
}
