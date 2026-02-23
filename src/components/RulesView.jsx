import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Trash2, ChevronDown, Minus, AlignLeft, Type,
  GripVertical, UsersRound, Plus, LayoutGrid,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay, useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, arrayMove, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

// ── Constants ────────────────────────────────────────────────────────────────

const COMMON_EMOJIS = [
  '📌','📋','✅','❌','⚠️','🔒','🎮','💬','🎵','🔊',
  '👋','❤️','⭐','🚫','📢','💡','🛡️','⚡','🎯','🔥',
  '❓','👑','🎉','🤝','💎','🏆','🎖️','📖','🗒️','🔑',
  '1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟',
];

const TEXT_COLORS = [
  { label: 'White',  value: '#F2F2F7' },
  { label: 'Gray',   value: '#8E8E93' },
  { label: 'Red',    value: '#FF453A' },
  { label: 'Orange', value: '#FF9F0A' },
  { label: 'Yellow', value: '#FFD60A' },
  { label: 'Green',  value: '#34C759' },
  { label: 'Blue',   value: '#007AFF' },
  { label: 'Purple', value: '#BF5AF2' },
];

const SEP_COLORS = [
  '#FFFFFF20', '#FFFFFF40', '#34C75960', '#007AFF60',
  '#FF453A60', '#FF9F0A60', '#BF5AF260', '#FFD60A60',
];

const FONT_SIZES = [
  { label: 'XS', value: 'xs',   cls: 'text-xs'   },
  { label: 'S',  value: 'sm',   cls: 'text-sm'   },
  { label: 'M',  value: 'base', cls: 'text-base' },
  { label: 'L',  value: 'lg',   cls: 'text-lg'   },
  { label: 'XL', value: 'xl',   cls: 'text-xl'   },
];

const DEFAULT_TEXT     = { emoji: '', text: '', bold: false, italic: false, underline: false, strike: false, code: false, fontSize: 'sm', color: '#F2F2F7' };
const DEFAULT_SEP      = { thickness: 1, color: '#FFFFFF30', width: 'full' };
const DEFAULT_CATEGORY = { label: 'Category', style: 'card' };

function fontSizeCls(size) {
  return FONT_SIZES.find((f) => f.value === size)?.cls ?? 'text-sm';
}

// ── FmtButton ─────────────────────────────────────────────────────────────────

function FmtButton({ active, onClick, children, title }) {
  return (
    <button
      type="button" title={title} onClick={onClick}
      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold transition-all
        ${active ? 'bg-nv-accent/20 text-nv-accent' : 'text-nv-text-secondary hover:bg-white/[0.06] hover:text-nv-text-primary'}`}
    >
      {children}
    </button>
  );
}

// ── Editors ───────────────────────────────────────────────────────────────────

function TextEditor({ initial, onSave, onCancel }) {
  const [d, setD] = useState({ ...DEFAULT_TEXT, ...initial });
  const [showEmojis, setShowEmojis] = useState(false);
  const emojiRef = useRef(null);

  useEffect(() => {
    if (!showEmojis) return;
    const h = (e) => { if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmojis(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showEmojis]);

  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const toggle = (k) => setD((p) => ({ ...p, [k]: !p[k] }));

  const previewCls = [
    fontSizeCls(d.fontSize), d.bold ? 'font-bold' : '', d.italic ? 'italic' : '',
    d.underline ? 'underline' : '', d.strike ? 'line-through' : '', d.code ? 'font-mono' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="space-y-3" onDoubleClick={(e) => e.stopPropagation()}>
      <div className="flex gap-3 items-start">
        <div className="relative shrink-0" ref={emojiRef}>
          <button type="button" onClick={(e) => { e.stopPropagation(); setShowEmojis((p) => !p); }}
            className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/[0.08] text-xl flex items-center justify-center hover:bg-white/[0.1] transition-colors">
            {d.emoji || <Plus size={14} className="text-nv-text-tertiary" />}
          </button>
          <AnimatePresence>
            {showEmojis && (
              <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.12 }}
                className="absolute top-12 left-0 z-50 grid grid-cols-8 gap-0.5 p-2 bg-nv-channels rounded-xl border border-white/[0.08] shadow-2xl" style={{ width: 220 }}>
                <button type="button" onClick={() => { set('emoji', ''); setShowEmojis(false); }}
                  className="col-span-8 text-[10px] text-nv-text-tertiary hover:text-nv-danger text-left px-1 pb-1">✕ Remove</button>
                {COMMON_EMOJIS.map((e) => (
                  <button key={e} type="button" onClick={() => { set('emoji', e); setShowEmojis(false); }}
                    className="w-6 h-6 flex items-center justify-center rounded text-base hover:bg-white/10 transition-colors">{e}</button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <textarea value={d.text} onChange={(e) => set('text', e.target.value)} placeholder="Enter text..." autoFocus rows={3}
          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-nv-text-primary placeholder-nv-text-tertiary resize-none outline-none focus:border-nv-accent/40 transition-colors leading-relaxed" />
      </div>
      <div className="flex items-center gap-1 p-1.5 bg-black/20 rounded-xl border border-white/[0.05] flex-wrap">
        <FmtButton active={d.bold}      onClick={() => toggle('bold')}      title="Bold"><span className="font-bold">B</span></FmtButton>
        <FmtButton active={d.italic}    onClick={() => toggle('italic')}    title="Italic"><span className="italic">I</span></FmtButton>
        <FmtButton active={d.underline} onClick={() => toggle('underline')} title="Underline"><span className="underline">U</span></FmtButton>
        <FmtButton active={d.strike}    onClick={() => toggle('strike')}    title="Strike"><span className="line-through">S</span></FmtButton>
        <FmtButton active={d.code}      onClick={() => toggle('code')}      title="Code"><span className="font-mono text-[11px]">{'{}'}</span></FmtButton>
        <div className="w-px h-4 bg-white/10 mx-0.5" />
        {FONT_SIZES.map((f) => (
          <button key={f.value} type="button" onClick={() => set('fontSize', f.value)}
            className={`px-1.5 h-7 rounded-lg text-[10px] font-semibold transition-all ${d.fontSize === f.value ? 'bg-nv-accent/20 text-nv-accent' : 'text-nv-text-secondary hover:bg-white/[0.06]'}`}>{f.label}</button>
        ))}
        <div className="w-px h-4 bg-white/10 mx-0.5" />
        {TEXT_COLORS.map((c) => (
          <button key={c.value} type="button" title={c.label} onClick={() => set('color', c.value)}
            className={`w-5 h-5 rounded-full border-2 transition-all ${d.color === c.value ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
            style={{ backgroundColor: c.value }} />
        ))}
      </div>
      <div className="px-3 py-2.5 bg-white/[0.03] rounded-xl border border-white/[0.05]">
        <p className="text-[10px] text-nv-text-tertiary mb-1.5 uppercase tracking-wider">Preview</p>
        <span className={previewCls} style={{ color: d.color }}>
          {d.emoji && <span className="mr-2">{d.emoji}</span>}
          {d.text || <span className="text-nv-text-tertiary italic">Your text here…</span>}
        </span>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="nv-button-ghost">Cancel</button>
        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => onSave(d)} disabled={!d.text.trim()} className="nv-button-primary disabled:opacity-40">Save</motion.button>
      </div>
    </div>
  );
}

function SeparatorEditor({ initial, onSave, onCancel }) {
  const [d, setD] = useState({ ...DEFAULT_SEP, ...initial });
  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const ws = { full: '100%', '3/4': '75%', '1/2': '50%' };
  return (
    <div className="space-y-4" onDoubleClick={(e) => e.stopPropagation()}>
      <div className="px-4 py-5 bg-black/20 rounded-xl border border-white/[0.05] flex items-center justify-center">
        <hr style={{ width: ws[d.width], borderColor: d.color, borderTopWidth: `${d.thickness}px`, borderStyle: 'solid' }} />
      </div>
      <div>
        <p className="text-xs text-nv-text-tertiary mb-2">Thickness</p>
        <div className="flex gap-2">
          {[1, 2, 4].map((t) => (
            <button key={t} type="button" onClick={() => set('thickness', t)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border ${d.thickness === t ? 'border-nv-accent/40 bg-nv-accent/10 text-nv-accent' : 'border-white/[0.08] bg-white/[0.03] text-nv-text-secondary hover:bg-white/[0.06]'}`}>{t}px</button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-nv-text-tertiary mb-2">Width</p>
        <div className="flex gap-2">
          {[['full', '100%'], ['3/4', '75%'], ['1/2', '50%']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => set('width', k)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border ${d.width === k ? 'border-nv-accent/40 bg-nv-accent/10 text-nv-accent' : 'border-white/[0.08] bg-white/[0.03] text-nv-text-secondary hover:bg-white/[0.06]'}`}>{label}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-nv-text-tertiary mb-2">Color</p>
        <div className="flex gap-2 flex-wrap">
          {SEP_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => set('color', c)}
              className={`w-7 h-7 rounded-full border-2 transition-all ${d.color === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="nv-button-ghost">Cancel</button>
        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => onSave(d)} className="nv-button-primary">Save</motion.button>
      </div>
    </div>
  );
}


// ── Display components ────────────────────────────────────────────────────────

function TextDisplay({ content: c }) {
  const cls = [
    fontSizeCls(c.fontSize ?? 'sm'), c.bold ? 'font-bold' : '', c.italic ? 'italic' : '',
    c.underline ? 'underline' : '', c.strike ? 'line-through' : '', c.code ? 'font-mono' : '',
  ].filter(Boolean).join(' ');
  return (
    <div className="flex items-start gap-2.5 py-2 px-3 min-w-0">
      {c.emoji && <span className="text-xl shrink-0 leading-tight">{c.emoji}</span>}
      <span className={`${cls} break-words min-w-0`} style={{ color: c.color ?? '#F2F2F7' }}>
        {c.text || <span className="text-nv-text-tertiary italic text-xs">Empty — double-click to edit</span>}
      </span>
    </div>
  );
}

function SeparatorDisplay({ content: c }) {
  const wm = { full: '100%', '3/4': '75%', '1/2': '50%' };
  return (
    <div className="flex items-center justify-center py-3 px-3">
      <hr style={{ width: wm[c.width ?? 'full'] ?? '100%', borderColor: c.color ?? '#FFFFFF30', borderTopWidth: `${c.thickness ?? 1}px`, borderStyle: 'solid' }} />
    </div>
  );
}

// ── Inline-editable text/separator item ───────────────────────────────────────

function BlockItem({ block, isOwner, dragHandleProps, onSaveEdit, onDelete, isDeleting, onEditingChange }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);

  const setEditingWithCb = useCallback((val) => {
    setEditing(val);
    onEditingChange?.(val);
  }, [onEditingChange]);

  useEffect(() => {
    if (!editing) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setEditingWithCb(false); };
    document.addEventListener('mousedown', h, true);
    return () => document.removeEventListener('mousedown', h, true);
  }, [editing, setEditingWithCb]);

  const handleSave = async (content) => { await onSaveEdit(block.id, content); setEditingWithCb(false); };

  return (
    <div
      ref={ref}
      onDoubleClick={isOwner && !editing ? (e) => { e.stopPropagation(); setEditingWithCb(true); } : undefined}
      className={`relative group flex items-center gap-1 rounded-xl min-h-[36px] transition-all
        ${isDeleting ? 'opacity-40 pointer-events-none' : ''}
        ${!editing && isOwner ? 'hover:bg-white/[0.04] cursor-pointer' : ''}
      `}
    >
      {isOwner && !editing && (
        <div {...dragHandleProps}
          className="opacity-0 group-hover:opacity-40 hover:!opacity-80 cursor-grab active:cursor-grabbing transition-opacity shrink-0 ml-1 touch-none">
          <GripVertical size={13} className="text-nv-text-tertiary" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="p-2">
            {block.type === 'text'      && <TextEditor      initial={block.content} onSave={handleSave} onCancel={() => setEditing(false)} />}
            {block.type === 'separator' && <SeparatorEditor initial={block.content} onSave={handleSave} onCancel={() => setEditing(false)} />}
          </div>
        ) : (
          <>
            {block.type === 'text'      && <TextDisplay      content={block.content} />}
            {block.type === 'separator' && <SeparatorDisplay content={block.content} />}
          </>
        )}
      </div>
      {isOwner && !editing && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mr-2 shrink-0">
          <span className="text-[9px] text-nv-text-tertiary/40 select-none">dbl</span>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(block.id); }}
            className="w-5 h-5 rounded flex items-center justify-center text-nv-text-tertiary hover:text-nv-danger hover:bg-nv-danger/20 transition-all">
            <Trash2 size={10} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sortable child item (inside a category) ───────────────────────────────────

function SortableChildItem({ block, isOwner, onSaveEdit, onDelete, isDeleting }) {
  const [editingChild, setEditingChild] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: editingChild });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}>
      <BlockItem block={block} isOwner={isOwner} dragHandleProps={{ ...attributes, ...listeners }}
        onSaveEdit={onSaveEdit} onDelete={onDelete} isDeleting={isDeleting} onEditingChange={setEditingChild} />
    </div>
  );
}

// ── Droppable content zone for empty categories ───────────────────────────────

function DroppableCategoryContent({ id, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: id + ':content' });
  return (
    <div ref={setNodeRef} className={`min-h-[44px] rounded-xl transition-colors ${isOver ? 'bg-nv-accent/5 ring-1 ring-nv-accent/20' : ''}`}>
      {children}
    </div>
  );
}

// ── Category card (plain box — no automatic label) ────────────────────────────

function CategoryCard({ block, isOwner, children, onSaveEdit, onDelete, onAddChild, deletingId, collapsed, onToggleCollapse }) {
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef(null);

  useEffect(() => {
    if (!addOpen) return;
    const h = (e) => { if (addRef.current && !addRef.current.contains(e.target)) setAddOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [addOpen]);

  const isDropdown = block.content?.style === 'dropdown';
  const isCollapsed = isDropdown && collapsed;
  const isDeleting = deletingId === block.id;

  return (
    <div className={`relative group/card rounded-2xl border border-white/[0.09] bg-white/[0.04] backdrop-blur-sm overflow-hidden transition-all
      ${isDeleting ? 'opacity-40 pointer-events-none' : ''}
    `}>
      {/* Dropdown collapse strip — only for dropdown style */}
      {isDropdown && (
        <button type="button" onClick={onToggleCollapse}
          className={`w-full flex items-center gap-2 px-3 py-2 text-nv-text-tertiary/50 hover:text-nv-text-tertiary hover:bg-white/[0.03] transition-colors
            ${!isCollapsed ? 'border-b border-white/[0.06]' : ''}`}>
          <motion.div animate={{ rotate: isCollapsed ? -90 : 0 }} transition={{ duration: 0.18 }}>
            <ChevronDown size={13} />
          </motion.div>
          {isCollapsed && children.length > 0 && (
            <span className="text-[10px] ml-0.5">{children.length} item{children.length !== 1 ? 's' : ''}</span>
          )}
        </button>
      )}

      {/* Owner hover actions — float top-right */}
      {isOwner && (
        <div className={`absolute right-2 z-10 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center gap-1
          ${isDropdown ? 'top-1' : 'top-2'}`}>
          <div className="relative" ref={addRef}>
            <button type="button" onClick={(e) => { e.stopPropagation(); setAddOpen((p) => !p); }}
              className="h-6 w-6 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.12] transition-all bg-nv-channels/80 backdrop-blur-sm"
              title="Add inside">
              <Plus size={11} />
            </button>
            <AnimatePresence>
              {addOpen && (
                <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.1 }}
                  className="absolute top-full right-0 mt-1 z-50 bg-nv-channels border border-white/[0.09] rounded-2xl shadow-2xl overflow-hidden min-w-[130px]">
                  {[['text', <Type size={13} />, 'Text'], ['separator', <Minus size={13} />, 'Separator']].map(([t, icon, label]) => (
                    <button key={t} type="button"
                      onClick={() => { onAddChild(block.id, t); setAddOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-white/[0.06] transition-colors text-sm text-nv-text-primary">
                      <span className="text-nv-text-tertiary">{icon}</span> {label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button type="button" onClick={() => onDelete(block.id)}
            className="h-6 w-6 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-danger hover:bg-nv-danger/15 transition-all bg-nv-channels/80 backdrop-blur-sm">
            <Trash2 size={11} />
          </button>
        </div>
      )}

      {/* Children */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div key="children" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <DroppableCategoryContent id={block.id}>
              <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <div className="p-2 space-y-0.5">
                  {children.map((child) => (
                    <SortableChildItem key={child.id} block={child} isOwner={isOwner}
                      onSaveEdit={onSaveEdit} onDelete={onDelete} isDeleting={deletingId === child.id} />
                  ))}
                  {children.length === 0 && isOwner && (
                    <p className="text-[11px] text-nv-text-tertiary/30 italic py-3 px-2 text-center">Click + to add content</p>
                  )}
                </div>
              </SortableContext>
            </DroppableCategoryContent>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sortable top-level group (a grid row or a standalone item) ────────────────

function SortableGroup({ group, isOwner, childrenOf, onSaveEdit, onDelete, onAddChild, deletingId, collapsed, onToggleCollapse }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });

  const colsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
  }[group.type === 'grid-row' ? group.items.length : 1] || 'grid-cols-1';

  const sharedCatProps = { isOwner, onSaveEdit, onDelete, onAddChild, deletingId };

  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      className="group/toplevel flex items-start gap-2"
    >
      {/* Row-level drag handle */}
      {isOwner && (
        <div {...attributes} {...listeners}
          className="mt-3.5 opacity-0 group-hover/toplevel:opacity-30 hover:!opacity-70 cursor-grab active:cursor-grabbing transition-opacity touch-none shrink-0">
          <GripVertical size={14} className="text-nv-text-tertiary" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        {group.type === 'grid-row' ? (
          <div className={`grid gap-3 ${colsClass}`}>
            {group.items.map((block) => (
              <CategoryCard key={block.id} block={block}
                children={childrenOf(block.id)}
                collapsed={collapsed.has(block.id)}
                onToggleCollapse={() => onToggleCollapse(block.id)}
                {...sharedCatProps} />
            ))}
          </div>
        ) : group.block.type === 'category' ? (
          <CategoryCard block={group.block}
            children={childrenOf(group.block.id)}
            collapsed={collapsed.has(group.block.id)}
            onToggleCollapse={() => onToggleCollapse(group.block.id)}
            {...sharedCatProps} />
        ) : (
          <BlockItem block={group.block} isOwner={isOwner}
            dragHandleProps={null /* handled by row drag above */}
            onSaveEdit={onSaveEdit} onDelete={onDelete} isDeleting={deletingId === group.block.id} />
        )}
      </div>
    </div>
  );
}

// ── Root droppable zone (so items can be dropped to standalone) ───────────────

function RootDropZone({ active }) {
  const { setNodeRef, isOver } = useDroppable({ id: '__root__' });
  if (!active) return null;
  return (
    <div ref={setNodeRef}
      className={`h-12 mt-2 rounded-2xl border-2 border-dashed transition-all duration-200 flex items-center justify-center
        ${isOver ? 'border-nv-accent/60 bg-nv-accent/5' : 'border-white/[0.07]'}`}>
      {isOver && <span className="text-xs text-nv-accent/70">Drop here to make standalone</span>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RulesView({ channel, serverId, onToggleMembers, showMembers }) {
  const { activeServerApi, serverDetails } = useApp();
  const { user } = useAuth();
  const { socket } = useSocket();

  const server = serverDetails[serverId]?.server;
  const isOwner = server?.owner_id === user?.id;

  const [blocks, setBlocks]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [collapsed, setCollapsed]   = useState(new Set());
  const [activeId, setActiveId]     = useState(null);

  // Header dropdowns
  const [catDropOpen,  setCatDropOpen]  = useState(false);
  const [gridDropOpen, setGridDropOpen] = useState(false);
  const catDropRef  = useRef(null);
  const gridDropRef = useRef(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // ── Load ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const data = await activeServerApi.getRuleBlocks(channel.id);
      setBlocks(data.blocks ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [activeServerApi, channel.id]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useEffect(() => {
    socket?.emit('channel:subscribe', { channelId: channel.id });
    const h = ({ channelId }) => { if (channelId === channel.id) load(); };
    socket?.on('channel:updated', h);
    return () => { socket?.off('channel:updated', h); socket?.emit('channel:unsubscribe', { channelId: channel.id }); };
  }, [socket, channel.id, load]);

  useEffect(() => {
    const h = (e) => {
      if (catDropRef.current  && !catDropRef.current.contains(e.target))  setCatDropOpen(false);
      if (gridDropRef.current && !gridDropRef.current.contains(e.target)) setGridDropOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────

  // Top-level blocks (not children of any category)
  const topLevelBlocks = useMemo(() =>
    blocks.filter((b) => !b.parent_id).sort((a, b) => a.sort_order - b.sort_order),
    [blocks],
  );

  // Group top-level items into: grid rows (same row_id) + standalone items
  const topLevelGroups = useMemo(() => {
    const groups = [];
    const seenRows = new Set();
    for (const block of topLevelBlocks) {
      if (block.row_id) {
        if (!seenRows.has(block.row_id)) {
          seenRows.add(block.row_id);
          const rowItems = topLevelBlocks
            .filter((b) => b.row_id === block.row_id)
            .sort((a, b) => (a.col_idx ?? 0) - (b.col_idx ?? 0));
          groups.push({ id: block.row_id, type: 'grid-row', items: rowItems, sort_order: block.sort_order });
        }
      } else {
        groups.push({ id: block.id, type: 'item', block, sort_order: block.sort_order });
      }
    }
    return groups.sort((a, b) => a.sort_order - b.sort_order);
  }, [topLevelBlocks]);

  const childrenOf = useCallback((catId) =>
    blocks.filter((b) => b.parent_id === catId).sort((a, b) => a.sort_order - b.sort_order),
    [blocks],
  );

  const findContainerId = useCallback((id) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return '__root__';
    return b.parent_id ?? '__root__';
  }, [blocks]);

  // ── CRUD ─────────────────────────────────────────────────────────────────

  const addBlock = async (type, parentId = null, extraContent = {}) => {
    setSaving(true);
    try {
      const defaultContent = type === 'text' ? DEFAULT_TEXT : type === 'separator' ? DEFAULT_SEP : DEFAULT_CATEGORY;
      const nextOrder = topLevelGroups.length;
      const childCount = parentId ? blocks.filter((b) => b.parent_id === parentId).length : 0;
      await activeServerApi.addRuleBlock(channel.id, {
        type,
        content: { ...defaultContent, ...extraContent },
        parent_id: parentId,
        sort_order: parentId ? childCount : nextOrder,
        row_id: null,
        col_idx: 0,
      });
      await load();
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const addGridRow = async (numCols) => {
    setSaving(true);
    try {
      const rowId = crypto.randomUUID();
      const nextOrder = topLevelGroups.length;
      for (let i = 0; i < numCols; i++) {
        await activeServerApi.addRuleBlock(channel.id, {
          type: 'category',
          content: { ...DEFAULT_CATEGORY, label: numCols > 1 ? `Category ${i + 1}` : 'Category' },
          parent_id: null,
          sort_order: nextOrder,
          row_id: rowId,
          col_idx: i,
        });
      }
      await load();
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const handleSaveEdit = async (blockId, content) => {
    setSaving(true);
    try { await activeServerApi.updateRuleBlock(channel.id, blockId, content); await load(); }
    catch (err) { console.error(err); }
    setSaving(false);
  };

  const handleDelete = async (blockId) => {
    setDeletingId(blockId);
    try { await activeServerApi.deleteRuleBlock(channel.id, blockId); await load(); }
    catch (err) { console.error(err); }
    setDeletingId(null);
  };

  const toggleCollapse = (catId) => {
    setCollapsed((prev) => { const n = new Set(prev); n.has(catId) ? n.delete(catId) : n.add(catId); return n; });
  };

  // ── DnD save helper ───────────────────────────────────────────────────────

  const saveOrder = async (updatedBlocks) => {
    try {
      await activeServerApi.reorderRuleBlocks(channel.id, updatedBlocks.map((b) => ({
        id: b.id, parent_id: b.parent_id ?? null, sort_order: b.sort_order,
        row_id: b.row_id ?? null, col_idx: b.col_idx ?? 0,
      })));
    } catch (err) { console.error(err); await load(); }
  };

  // ── DnD handlers ─────────────────────────────────────────────────────────

  const handleDragStart = ({ active }) => setActiveId(active.id);

  const handleDragOver = ({ active, over }) => {
    if (!over || active.id === over.id) return;

    const activeBlock = blocks.find((b) => b.id === active.id);
    if (!activeBlock || activeBlock.type === 'category') return; // only text/sep cross-container

    const overBlock = blocks.find((b) => b.id === over.id);
    const activeContainerId = activeBlock.parent_id ?? '__root__';

    let overContainerId;
    if (!overBlock) {
      // over.id is a virtual droppable: '__root__' or 'blockId:content'
      const overId = String(over.id);
      overContainerId = overId.endsWith(':content') ? overId.slice(0, -8) : overId;
    } else if (overBlock.type === 'category') {
      overContainerId = overBlock.id;
    } else {
      overContainerId = overBlock.parent_id ?? '__root__';
    }

    if (activeContainerId === overContainerId) return;

    setBlocks((prev) => {
      const newParentId = overContainerId === '__root__' ? null : overContainerId;
      const siblingsInTarget = prev
        .filter((b) => (b.parent_id ?? '__root__') === overContainerId && b.id !== active.id)
        .sort((a, b) => a.sort_order - b.sort_order);
      const overIdx = overBlock ? siblingsInTarget.findIndex((b) => b.id === over.id) : -1;
      const newSortOrder = overIdx >= 0 ? overIdx : siblingsInTarget.length;
      return prev.map((b) => b.id === active.id ? { ...b, parent_id: newParentId, sort_order: newSortOrder } : b);
    });
  };

  const handleDragEnd = async ({ active, over }) => {
    setActiveId(null);
    if (!over) { await load(); return; }

    const activeBlock = blocks.find((b) => b.id === active.id);
    if (!activeBlock) return;

    // If dropping on __root__ zone, move item to standalone (root)
    if (over.id === '__root__') {
      const nextOrder = topLevelGroups.length;
      const updated = blocks.map((b) =>
        b.id === active.id ? { ...b, parent_id: null, sort_order: nextOrder, row_id: null, col_idx: 0 } : b,
      );
      setBlocks(updated);
      await saveOrder(updated);
      return;
    }

    const overBlock = blocks.find((b) => b.id === over.id);

    // ── Top-level group reordering ──
    const activeIsTopLevel = !activeBlock.parent_id && activeBlock.type === 'category';
    const overIsTopLevel   = overBlock && !overBlock.parent_id;

    if (activeBlock.type === 'category' && activeIsTopLevel && overIsTopLevel) {
      // Reorder top-level groups
      const oldIdx = topLevelGroups.findIndex((g) =>
        g.type === 'grid-row' ? g.items.some((i) => i.id === active.id) : g.id === active.id,
      );
      const newIdx = topLevelGroups.findIndex((g) =>
        g.type === 'grid-row' ? g.items.some((i) => i.id === over.id) : g.id === over.id,
      );
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;

      const reorderedGroups = arrayMove(topLevelGroups, oldIdx, newIdx);
      const finalBlocks = [...blocks];
      reorderedGroups.forEach((group, groupIdx) => {
        if (group.type === 'grid-row') {
          group.items.forEach((item) => {
            const idx = finalBlocks.findIndex((b) => b.id === item.id);
            if (idx !== -1) finalBlocks[idx] = { ...finalBlocks[idx], sort_order: groupIdx };
          });
        } else {
          const idx = finalBlocks.findIndex((b) => b.id === group.id);
          if (idx !== -1) finalBlocks[idx] = { ...finalBlocks[idx], sort_order: groupIdx };
        }
      });
      setBlocks(finalBlocks);
      await saveOrder(finalBlocks);
      return;
    }

    // ── Within-category reordering ──
    const activeContainerId = activeBlock.parent_id ?? '__root__';
    const overContainerId   = overBlock ? (overBlock.parent_id ?? '__root__') : '__root__';

    if (activeContainerId === overContainerId && activeContainerId !== '__root__') {
      const containerItems = blocks
        .filter((b) => b.parent_id === activeContainerId)
        .sort((a, b) => a.sort_order - b.sort_order);
      const oldIdx = containerItems.findIndex((b) => b.id === active.id);
      const newIdx = containerItems.findIndex((b) => b.id === over.id);
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
      const reordered = arrayMove(containerItems, oldIdx, newIdx).map((b, i) => ({ ...b, sort_order: i }));
      const finalBlocks = blocks.map((b) => reordered.find((r) => r.id === b.id) ?? b);
      setBlocks(finalBlocks);
      await saveOrder(finalBlocks);
      return;
    }

    // ── Cross-container (already handled by onDragOver) — save current state ──
    await saveOrder(blocks);
  };

  const activeBlock = activeId ? blocks.find((b) => b.id === activeId) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col bg-nv-content min-w-0">
      {/* Header */}
      <div className="h-12 flex items-center px-4 border-b border-white/[0.05] shrink-0 gap-1.5">
        <BookOpen size={16} className="text-nv-text-tertiary shrink-0" />
        <span className="text-sm font-semibold text-nv-text-primary truncate flex-1">{channel.name}</span>

        {saving && <div className="w-3.5 h-3.5 rounded-full border-2 border-nv-accent border-t-transparent animate-spin shrink-0" />}

        {isOwner && (
          <div className="flex items-center gap-0.5">

            {/* Category button (standalone) */}
            <div className="relative" ref={catDropRef}>
              <button onClick={() => setCatDropOpen((p) => !p)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all">
                <AlignLeft size={12} />
                <span>Category</span>
                <ChevronDown size={9} className={`transition-transform ${catDropOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {catDropOpen && (
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.1 }}
                    className="absolute top-full left-0 mt-1.5 z-50 min-w-[150px] bg-nv-channels/95 backdrop-blur-xl border border-white/[0.09] rounded-2xl shadow-2xl overflow-hidden">
                    {[['card', 'Card', 'Always visible'], ['dropdown', 'Dropdown', 'Collapsible']].map(([style, label, desc]) => (
                      <button key={style} type="button"
                        onClick={() => { addBlock('category', null, { style, label: 'Category' }); setCatDropOpen(false); }}
                        className="w-full flex flex-col items-start px-4 py-3 hover:bg-white/[0.06] transition-colors text-left">
                        <span className="text-sm text-nv-text-primary font-medium">{label}</span>
                        <span className="text-[10px] text-nv-text-tertiary mt-0.5">{desc}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Grid row button (1/2/3 columns) */}
            <div className="relative" ref={gridDropRef}>
              <button onClick={() => setGridDropOpen((p) => !p)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all">
                <LayoutGrid size={12} />
                <span>Grid</span>
                <ChevronDown size={9} className={`transition-transform ${gridDropOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {gridDropOpen && (
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.1 }}
                    className="absolute top-full left-0 mt-1.5 z-50 min-w-[160px] bg-nv-channels/95 backdrop-blur-xl border border-white/[0.09] rounded-2xl shadow-2xl overflow-hidden p-1.5">
                    <p className="text-[10px] text-nv-text-tertiary/60 uppercase tracking-wider px-3 pt-1.5 pb-2">Columns</p>
                    {[1, 2, 3].map((n) => (
                      <button key={n} type="button"
                        onClick={() => { addGridRow(n); setGridDropOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.07] transition-colors text-left">
                        <div className={`grid gap-1 flex-1 ${n === 1 ? 'grid-cols-1' : n === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                          {Array.from({ length: n }).map((_, i) => (
                            <div key={i} className="h-4 rounded-md bg-white/[0.12]" />
                          ))}
                        </div>
                        <span className="text-sm text-nv-text-primary font-medium shrink-0">{n} col{n > 1 ? 's' : ''}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="w-px h-3.5 bg-white/[0.1] mx-0.5" />

            {/* Text button */}
            <button onClick={() => addBlock('text')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all">
              <Type size={12} /> Text
            </button>

            {/* Separator button */}
            <button onClick={() => addBlock('separator')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all">
              <Minus size={12} /> Sep
            </button>

            <div className="w-px h-3.5 bg-white/[0.1] mx-0.5" />
          </div>
        )}

        {/* Show members */}
        {onToggleMembers && (
          <button onClick={onToggleMembers}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0 ${
              showMembers ? 'bg-white/10 text-nv-text-primary' : 'text-nv-text-tertiary hover:bg-white/[0.05] hover:text-nv-text-secondary'
            }`} title="Toggle member list">
            <UsersRound size={15} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 rounded-full border-2 border-nv-accent border-t-transparent animate-spin" />
          </div>
        ) : topLevelGroups.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-nv-surface/30 flex items-center justify-center mb-4">
              <BookOpen size={28} className="text-nv-text-tertiary" />
            </div>
            <h3 className="text-base font-semibold text-nv-text-primary mb-1">No rules yet</h3>
            <p className="text-sm text-nv-text-secondary">
              {isOwner ? 'Use the buttons above to add content.' : "The server owner hasn't added any rules yet."}
            </p>
          </motion.div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            <SortableContext items={topLevelGroups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {topLevelGroups.map((group) => (
                  <motion.div key={group.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
                    <SortableGroup
                      group={group}
                      isOwner={isOwner}
                      childrenOf={childrenOf}
                      onSaveEdit={handleSaveEdit}
                      onDelete={handleDelete}
                      onAddChild={(catId, type) => addBlock(type, catId)}
                      deletingId={deletingId}
                      collapsed={collapsed}
                      onToggleCollapse={toggleCollapse}
                    />
                  </motion.div>
                ))}
                {/* Drop zone at bottom for dragging items out of categories */}
                <RootDropZone active={activeId} />
              </div>
            </SortableContext>

            <DragOverlay dropAnimation={{ duration: 140, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
              {activeBlock && (
                <div className="rounded-2xl border border-white/[0.12] bg-nv-surface shadow-2xl opacity-95 pointer-events-none">
                  {activeBlock.type === 'text'      && <TextDisplay      content={activeBlock.content} />}
                  {activeBlock.type === 'separator' && <SeparatorDisplay content={activeBlock.content} />}
                  {activeBlock.type === 'category'  && (
                    <div className="px-4 py-3">
                      <span className="text-sm font-semibold text-nv-text-primary">{activeBlock.content?.label || 'Category'}</span>
                    </div>
                  )}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}
