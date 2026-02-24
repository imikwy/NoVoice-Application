import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus, Search, Trash2, Circle, CheckCircle2, ChevronRight,
    Bell, Calendar, Flag, List, Star, Inbox, ListTodo, X, Tag,
} from 'lucide-react';

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'nv_app_reminders';

function load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultState();
        const parsed = JSON.parse(raw);
        // Validate minimal structure
        if (!parsed?.lists || !parsed?.items) return defaultState();
        return parsed;
    } catch { return defaultState(); }
}

function defaultState() {
    const inboxId = `list_inbox`;
    return {
        lists: [
            { id: inboxId, name: 'Reminders', icon: '📋', color: '#007AFF', system: true },
            { id: 'list_work', name: 'Work', icon: '💼', color: '#FF9500', system: false },
            { id: 'list_personal', name: 'Personal', icon: '🏠', color: '#34C759', system: false },
        ],
        items: [],
        selectedListId: inboxId,
    };
}

function save(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

const PRIORITY_CONFIG = {
    none: { label: 'None', color: 'text-nv-text-tertiary', dot: 'bg-nv-text-tertiary/30', flag: null },
    low: { label: 'Low', color: 'text-blue-400', dot: 'bg-blue-400', flag: '!' },
    medium: { label: 'Medium', color: 'text-orange-400', dot: 'bg-orange-400', flag: '!!' },
    high: { label: 'High', color: 'text-red-400', dot: 'bg-red-400', flag: '!!!' },
};

function isOverdue(item) {
    if (!item.dueDate || item.completed) return false;
    return new Date(item.dueDate) < new Date();
}

function isDueToday(item) {
    if (!item.dueDate || item.completed) return false;
    const d = new Date(item.dueDate);
    const now = new Date();
    return d.toDateString() === now.toDateString();
}

function formatDue(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const now = new Date();
    const diff = d - now;
    const oneDay = 86400000;

    if (d.toDateString() === now.toDateString()) return 'Today';
    if (d.toDateString() === new Date(now - oneDay).toDateString()) return 'Yesterday';
    if (d.toDateString() === new Date(now + oneDay).toDateString()) return 'Tomorrow';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Smart lists (virtual) ─────────────────────────────────────────────────────

const SMART_LISTS = [
    { id: '__today__', name: 'Today', icon: Calendar, color: '#007AFF' },
    { id: '__starred__', name: 'Starred', icon: Star, color: '#FF9500' },
    { id: '__scheduled__', name: 'Scheduled', icon: Bell, color: '#34C759' },
    { id: '__all__', name: 'All', icon: Inbox, color: '#636366' },
];

function filterForSmartList(items, id) {
    const active = items.filter((i) => !i.completed);
    if (id === '__today__') return active.filter(isDueToday);
    if (id === '__starred__') return active.filter((i) => i.starred);
    if (id === '__scheduled__') return active.filter((i) => i.dueDate);
    if (id === '__all__') return active;
    return [];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ReminderRow({ item, onComplete, onDelete, onUpdate, accentColor }) {
    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState(item.title);
    const inputRef = useRef(null);
    const overdue = isOverdue(item);
    const today = isDueToday(item);
    const prio = PRIORITY_CONFIG[item.priority ?? 'none'];

    const commitEdit = () => {
        const t = editText.trim();
        if (t) onUpdate(item.id, { title: t });
        else setEditText(item.title);
        setEditing(false);
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="group flex items-start gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.04] transition-colors"
        >
            {/* Checkbox */}
            <button
                onClick={() => onComplete(item.id)}
                className="mt-0.5 shrink-0 transition-transform active:scale-90"
                style={{ color: accentColor }}
            >
                {item.completed
                    ? <CheckCircle2 size={18} className="opacity-60" />
                    : <Circle size={18} className="opacity-70 hover:opacity-100 transition-opacity" />
                }
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
                {editing ? (
                    <input
                        ref={inputRef}
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditText(item.title); setEditing(false); } }}
                        className="w-full bg-transparent text-sm text-nv-text-primary outline-none border-b border-white/20 pb-0.5"
                    />
                ) : (
                    <p
                        onDoubleClick={() => { setEditing(true); setEditText(item.title); }}
                        className={`text-sm leading-snug cursor-text select-none ${item.completed ? 'line-through text-nv-text-tertiary' : 'text-nv-text-primary'
                            }`}
                    >
                        {item.title}
                    </p>
                )}

                {/* Meta row */}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {item.dueDate && (
                        <span className={`text-[10px] flex items-center gap-0.5 ${overdue ? 'text-red-400' : today ? 'text-blue-400' : 'text-nv-text-tertiary'
                            }`}>
                            <Calendar size={9} />
                            {formatDue(item.dueDate)}
                        </span>
                    )}
                    {item.priority && item.priority !== 'none' && (
                        <span className={`text-[10px] font-bold ${prio.color}`}>{prio.flag}</span>
                    )}
                    {item.note && (
                        <span className="text-[10px] text-nv-text-tertiary truncate max-w-[140px]">{item.note}</span>
                    )}
                </div>
            </div>

            {/* Actions (on hover) */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                    onClick={() => onUpdate(item.id, { starred: !item.starred })}
                    className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${item.starred ? 'text-orange-400' : 'text-nv-text-tertiary hover:text-orange-400'
                        }`}
                    title="Star"
                >
                    <Star size={11} />
                </button>
                <button
                    onClick={() => onDelete(item.id)}
                    className="w-6 h-6 rounded flex items-center justify-center text-nv-text-tertiary hover:text-red-400 transition-colors"
                    title="Delete"
                >
                    <Trash2 size={11} />
                </button>
            </div>
        </motion.div>
    );
}

function AddReminderRow({ onAdd, accentColor }) {
    const [active, setActive] = useState(false);
    const [title, setTitle] = useState('');
    const [note, setNote] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [priority, setPriority] = useState('none');
    const inputRef = useRef(null);

    const commit = () => {
        const t = title.trim();
        if (!t) { setActive(false); setTitle(''); setNote(''); setDueDate(''); setPriority('none'); return; }
        onAdd({ title: t, note, dueDate: dueDate || null, priority });
        setTitle(''); setNote(''); setDueDate(''); setPriority('none');
        inputRef.current?.focus();
    };

    if (!active) {
        return (
            <button
                onClick={() => { setActive(true); setTimeout(() => inputRef.current?.focus(), 30); }}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl hover:bg-white/[0.04] transition-colors w-full text-left"
                style={{ color: accentColor }}
            >
                <Plus size={16} />
                <span>New Reminder</span>
            </button>
        );
    }

    return (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 space-y-2">
            <input
                ref={inputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setActive(false); }}
                placeholder="Title"
                className="w-full bg-transparent text-sm text-nv-text-primary placeholder-nv-text-tertiary/50 outline-none font-medium"
            />
            <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setActive(false); }}
                placeholder="Notes"
                className="w-full bg-transparent text-xs text-nv-text-secondary placeholder-nv-text-tertiary/40 outline-none"
            />
            <div className="flex items-center gap-2 pt-1">
                {/* Due date */}
                <div className="flex items-center gap-1 bg-white/[0.05] rounded-lg px-2 py-1">
                    <Calendar size={11} className="text-nv-text-tertiary" />
                    <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="bg-transparent text-[11px] text-nv-text-secondary outline-none w-[90px] cursor-pointer"
                    />
                </div>

                {/* Priority */}
                <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="bg-white/[0.05] border-none text-[11px] text-nv-text-secondary rounded-lg px-2 py-1 outline-none cursor-pointer"
                >
                    <option value="none">Priority</option>
                    <option value="low">! Low</option>
                    <option value="medium">!! Medium</option>
                    <option value="high">!!! High</option>
                </select>

                <div className="flex-1" />

                <button onClick={() => setActive(false)} className="text-xs text-nv-text-tertiary hover:text-nv-text-secondary px-2 py-1">Cancel</button>
                <button
                    onClick={commit}
                    disabled={!title.trim()}
                    className="text-xs font-medium px-3 py-1 rounded-lg disabled:opacity-40 transition-all"
                    style={{ backgroundColor: `${accentColor}25`, color: accentColor }}
                >
                    Add
                </button>
            </div>
        </div>
    );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function RemindersApp() {
    const [state, setState] = useState(() => load());
    const [query, setQuery] = useState('');
    const [showCompleted, setShowCompleted] = useState(false);
    const [newListName, setNewListName] = useState('');
    const [addingList, setAddingList] = useState(false);
    const newListRef = useRef(null);

    // Persist state
    useEffect(() => { save(state); }, [state]);

    const { lists, items, selectedListId } = state;

    const isSmartList = SMART_LISTS.some((l) => l.id === selectedListId);
    const currentList = isSmartList
        ? SMART_LISTS.find((l) => l.id === selectedListId)
        : lists.find((l) => l.id === selectedListId);

    const accentColor = isSmartList
        ? currentList?.color ?? '#007AFF'
        : currentList?.color ?? '#007AFF';

    // Counts for smart list badges
    const smartCounts = useMemo(() => ({
        __today__: items.filter((i) => !i.completed && isDueToday(i)).length,
        __starred__: items.filter((i) => !i.completed && i.starred).length,
        __scheduled__: items.filter((i) => !i.completed && i.dueDate).length,
        __all__: items.filter((i) => !i.completed).length,
    }), [items]);

    const listCount = (listId) => items.filter((i) => i.listId === listId && !i.completed).length;

    // Current view items
    const visibleItems = useMemo(() => {
        let pool = isSmartList
            ? filterForSmartList(items, selectedListId)
            : items.filter((i) => i.listId === selectedListId);

        if (query.trim()) {
            const q = query.toLowerCase();
            pool = items.filter((i) => i.title.toLowerCase().includes(q) || i.note?.toLowerCase().includes(q));
        }

        const active = pool.filter((i) => !i.completed);
        const done = pool.filter((i) => i.completed);

        // Sort: high priority → medium → low → none, then by dueDate asc
        const prioOrder = { high: 0, medium: 1, low: 2, none: 3 };
        active.sort((a, b) => {
            const pd = (prioOrder[a.priority] ?? 3) - (prioOrder[b.priority] ?? 3);
            if (pd !== 0) return pd;
            if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            return b.createdAt - a.createdAt;
        });

        return { active, done };
    }, [items, selectedListId, isSmartList, query]);

    // ── Mutations ────────────────────────────────────────────────────────────────

    const addItem = useCallback((fields) => {
        const item = {
            id: uid(),
            listId: isSmartList ? (lists[0]?.id ?? 'list_inbox') : selectedListId,
            title: fields.title,
            note: fields.note || '',
            dueDate: fields.dueDate || null,
            priority: fields.priority || 'none',
            starred: false,
            completed: false,
            createdAt: Date.now(),
        };
        setState((s) => ({ ...s, items: [...s.items, item] }));
    }, [selectedListId, isSmartList, lists]);

    const completeItem = useCallback((id) => {
        setState((s) => ({
            ...s,
            items: s.items.map((i) =>
                i.id === id ? { ...i, completed: !i.completed, completedAt: i.completed ? null : Date.now() } : i
            ),
        }));
    }, []);

    const deleteItem = useCallback((id) => {
        setState((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) }));
    }, []);

    const updateItem = useCallback((id, fields) => {
        setState((s) => ({
            ...s,
            items: s.items.map((i) => i.id === id ? { ...i, ...fields } : i),
        }));
    }, []);

    const selectList = (id) => setState((s) => ({ ...s, selectedListId: id }));

    const deleteList = (id) => {
        setState((s) => ({
            ...s,
            lists: s.lists.filter((l) => l.id !== id),
            items: s.items.filter((i) => i.listId !== id),
            selectedListId: s.selectedListId === id ? (SMART_LISTS[0]?.id ?? s.lists[0]?.id) : s.selectedListId,
        }));
    };

    const addList = () => {
        const name = newListName.trim();
        if (!name) { setAddingList(false); return; }
        const id = `list_${uid()}`;
        const colors = ['#007AFF', '#FF9500', '#34C759', '#FF3B30', '#AF52DE', '#FF2D55', '#5856D6'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        setState((s) => ({
            ...s,
            lists: [...s.lists, { id, name, icon: '📋', color, system: false }],
            selectedListId: id,
        }));
        setNewListName('');
        setAddingList(false);
    };

    const clearCompleted = () => {
        const pool = new Set(visibleItems.done.map((i) => i.id));
        setState((s) => ({ ...s, items: s.items.filter((i) => !pool.has(i.id)) }));
    };

    // ── Render ───────────────────────────────────────────────────────────────────

    return (
        <div className="flex h-full overflow-hidden font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif]">

            {/* ── Sidebar ── */}
            <div className="w-[220px] shrink-0 border-r border-white/[0.06] flex flex-col bg-nv-sidebar/60 py-3 gap-1">

                {/* Search */}
                <div className="px-3 mb-1">
                    <div className="relative">
                        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nv-text-tertiary pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="w-full bg-white/[0.05] border border-white/[0.07] rounded-lg pl-7 pr-3 py-1.5 text-xs text-nv-text-primary placeholder-nv-text-tertiary outline-none focus:border-white/20 transition-colors"
                        />
                        {query && (
                            <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-nv-text-tertiary hover:text-nv-text-primary">
                                <X size={11} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Smart lists */}
                <div className="px-2">
                    <p className="px-2 pb-1 text-[9px] font-semibold text-nv-text-tertiary uppercase tracking-wider">Quick View</p>
                    {SMART_LISTS.map((sl) => {
                        const Icon = sl.icon;
                        const count = smartCounts[sl.id];
                        return (
                            <button
                                key={sl.id}
                                onClick={() => selectList(sl.id)}
                                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-sm transition-all ${selectedListId === sl.id
                                        ? 'bg-white/[0.09] text-nv-text-primary'
                                        : 'text-nv-text-secondary hover:bg-white/[0.05] hover:text-nv-text-primary'
                                    }`}
                            >
                                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${sl.color}25` }}>
                                    <Icon size={12} style={{ color: sl.color }} />
                                </div>
                                <span className="flex-1 text-left text-xs font-medium">{sl.name}</span>
                                {count > 0 && <span className="text-[10px] text-nv-text-tertiary font-medium">{count}</span>}
                            </button>
                        );
                    })}
                </div>

                {/* Divider */}
                <div className="h-px bg-white/[0.06] mx-3 my-1" />

                {/* My Lists */}
                <div className="px-2 flex-1 overflow-y-auto">
                    <p className="px-2 pb-1 text-[9px] font-semibold text-nv-text-tertiary uppercase tracking-wider">My Lists</p>
                    {lists.map((list) => {
                        const count = listCount(list.id);
                        return (
                            <button
                                key={list.id}
                                onClick={() => selectList(list.id)}
                                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-sm transition-all group ${selectedListId === list.id
                                        ? 'bg-white/[0.09] text-nv-text-primary'
                                        : 'text-nv-text-secondary hover:bg-white/[0.05] hover:text-nv-text-primary'
                                    }`}
                            >
                                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-sm" style={{ backgroundColor: `${list.color}25` }}>
                                    <span style={{ fontSize: 12 }}>{list.icon}</span>
                                </div>
                                <span className="flex-1 text-left text-xs font-medium truncate">{list.name}</span>
                                {!list.system && (
                                    <span
                                        onClick={(e) => { e.stopPropagation(); deleteList(list.id); }}
                                        className="opacity-0 group-hover:opacity-100 w-4 h-4 rounded flex items-center justify-center text-nv-text-tertiary hover:text-red-400 transition-all"
                                        title="Delete list"
                                    >
                                        <X size={10} />
                                    </span>
                                )}
                                {count > 0 && <span className="text-[10px] text-nv-text-tertiary font-medium">{count}</span>}
                            </button>
                        );
                    })}

                    {/* Add list */}
                    {addingList ? (
                        <div className="mt-1 px-2">
                            <input
                                ref={newListRef}
                                autoFocus
                                value={newListName}
                                onChange={(e) => setNewListName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') addList(); if (e.key === 'Escape') { setAddingList(false); setNewListName(''); } }}
                                onBlur={addList}
                                placeholder="List name…"
                                className="w-full bg-white/[0.06] rounded-lg px-2 py-1.5 text-xs text-nv-text-primary placeholder-nv-text-tertiary/50 outline-none border border-white/10"
                            />
                        </div>
                    ) : (
                        <button
                            onClick={() => setAddingList(true)}
                            className="flex items-center gap-2 px-2 py-1.5 w-full text-nv-text-tertiary hover:text-nv-text-secondary text-xs transition-colors rounded-xl hover:bg-white/[0.04] mt-0.5"
                        >
                            <Plus size={12} />
                            <span>Add List</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ── Main Content ── */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 pt-5 pb-3 shrink-0">
                    <h1 className="text-2xl font-bold" style={{ color: accentColor }}>
                        {currentList?.name ?? 'Reminders'}
                    </h1>
                    <p className="text-xs text-nv-text-tertiary mt-0.5">
                        {visibleItems.active.length} {visibleItems.active.length === 1 ? 'reminder' : 'reminders'}
                    </p>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto px-4 pb-6">

                    {/* Active items */}
                    {visibleItems.active.length === 0 && !query ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                            <div className="w-14 h-14 rounded-3xl flex items-center justify-center text-3xl"
                                style={{ backgroundColor: `${accentColor}15` }}>
                                <ListTodo size={26} style={{ color: accentColor, opacity: 0.6 }} />
                            </div>
                            <p className="text-sm font-medium text-nv-text-primary">No Reminders</p>
                            <p className="text-xs text-nv-text-tertiary">Tap "New Reminder" to add one.</p>
                        </div>
                    ) : (
                        <AnimatePresence initial={false}>
                            {visibleItems.active.map((item) => (
                                <ReminderRow
                                    key={item.id}
                                    item={item}
                                    onComplete={completeItem}
                                    onDelete={deleteItem}
                                    onUpdate={updateItem}
                                    accentColor={accentColor}
                                />
                            ))}
                        </AnimatePresence>
                    )}

                    {/* Add new */}
                    {!isSmartList && !query && (
                        <div className="mt-2">
                            <AddReminderRow onAdd={addItem} accentColor={accentColor} />
                        </div>
                    )}

                    {/* Completed section */}
                    {visibleItems.done.length > 0 && (
                        <div className="mt-4">
                            <button
                                onClick={() => setShowCompleted((v) => !v)}
                                className="flex items-center gap-1.5 px-1 text-xs text-nv-text-tertiary hover:text-nv-text-secondary transition-colors mb-1"
                            >
                                <ChevronRight
                                    size={12}
                                    className={`transition-transform ${showCompleted ? 'rotate-90' : ''}`}
                                />
                                Completed ({visibleItems.done.length})
                            </button>

                            <AnimatePresence>
                                {showCompleted && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                    >
                                        {visibleItems.done.map((item) => (
                                            <ReminderRow
                                                key={item.id}
                                                item={item}
                                                onComplete={completeItem}
                                                onDelete={deleteItem}
                                                onUpdate={updateItem}
                                                accentColor={accentColor}
                                            />
                                        ))}
                                        <button
                                            onClick={clearCompleted}
                                            className="text-xs text-nv-text-tertiary hover:text-red-400 transition-colors px-3 py-1 mt-1"
                                        >
                                            Clear Completed
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
