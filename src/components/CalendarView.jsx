import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays,
  Plus,
  Trash2,
  X,
  Check,
  Clock,
  Grid3X3,
  List,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const EVENT_COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#FF2D55', '#5AC8FA', '#FFCC00'];
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMonthTitle(date) {
  return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateOnly(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

function mondayIndex(day) {
  return (day + 6) % 7;
}

function buildMonthGrid(baseDate) {
  const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const monthEnd = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);

  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - mondayIndex(monthStart.getDay()));

  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - mondayIndex(monthEnd.getDay())));

  const days = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function isUpcoming(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parseDateOnly(dateStr) >= today;
}

function creatorLabel(event) {
  return event.creator_display_name || event.creator_username || 'Unknown';
}

export default function CalendarView({ channel, serverId }) {
  const { activeServerApi, serverDetails } = useApp();
  const { user } = useAuth();
  const { socket } = useSocket();

  const server = serverDetails[serverId]?.server;
  const isOwner = server?.owner_id === user?.id;

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState('month');
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColor, setFormColor] = useState('#007AFF');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await activeServerApi.getCalendarEvents(channel.id);
      setEvents(data.events || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeServerApi, channel.id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    socket?.emit('channel:subscribe', { channelId: channel.id });
    const handler = ({ channelId }) => {
      if (channelId === channel.id) load();
    };
    socket?.on('channel:updated', handler);
    return () => {
      socket?.off('channel:updated', handler);
      socket?.emit('channel:unsubscribe', { channelId: channel.id });
    };
  }, [socket, channel.id, load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDate) return;
    setSubmitting(true);
    try {
      await activeServerApi.createCalendarEvent(channel.id, {
        title: formTitle.trim(),
        description: formDescription.trim(),
        start_date: formDate,
        color: formColor,
      });
      setFormTitle('');
      setFormDate('');
      setFormDescription('');
      setFormColor('#007AFF');
      setShowForm(false);
      await load();
    } catch (err) {
      console.error(err);
    }
    setSubmitting(false);
  };

  const handleDelete = async (eventId) => {
    try {
      await activeServerApi.deleteCalendarEvent(channel.id, eventId);
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
    } catch (err) {
      console.error(err);
    }
  };

  const eventsByDate = useMemo(() => {
    const grouped = new Map();
    events.forEach((event) => {
      if (!grouped.has(event.start_date)) grouped.set(event.start_date, []);
      grouped.get(event.start_date).push(event);
    });
    return grouped;
  }, [events]);

  const monthGridDays = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);

  const upcoming = events.filter((e) => isUpcoming(e.start_date));
  const past = events.filter((e) => !isUpcoming(e.start_date));

  const previousMonth = () => {
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  return (
    <div className="flex-1 flex flex-col bg-nv-content min-w-0">
      <div className="h-12 flex items-center px-4 border-b border-white/[0.05] shrink-0 gap-2">
        <CalendarDays size={16} className="text-nv-text-tertiary shrink-0" />
        <span className="text-sm font-semibold text-nv-text-primary truncate flex-1">{channel.name}</span>

        <div className="flex items-center gap-1 p-0.5 rounded-lg border border-white/[0.07] bg-white/[0.03]">
          <button
            onClick={() => setViewMode('month')}
            className={`px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1 ${
              viewMode === 'month' ? 'bg-white/[0.10] text-nv-text-primary' : 'text-nv-text-tertiary hover:text-nv-text-secondary'
            }`}
          >
            <Grid3X3 size={12} />
            Month
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1 ${
              viewMode === 'list' ? 'bg-white/[0.10] text-nv-text-primary' : 'text-nv-text-tertiary hover:text-nv-text-secondary'
            }`}
          >
            <List size={12} />
            List
          </button>
        </div>

        {isOwner && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all"
          >
            {showForm ? <X size={12} /> : <Plus size={12} />}
            {showForm ? 'Cancel' : 'Add Event'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <AnimatePresence>
          {showForm && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleCreate}
              className="overflow-hidden mb-4"
            >
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-nv-text-primary">New Event</h3>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Event title"
                  className="nv-input"
                  required
                />
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="nv-input flex-1 [color-scheme:dark]"
                    required
                  />
                </div>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-nv-text-primary placeholder-nv-text-tertiary resize-none outline-none focus:border-nv-accent/40 transition-colors"
                />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-nv-text-tertiary mb-2">Color</p>
                  <div className="flex gap-2 flex-wrap">
                    {EVENT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFormColor(c)}
                        className="w-6 h-6 rounded-full transition-all hover:scale-110 relative"
                        style={{ backgroundColor: c }}
                      >
                        {formColor === c && (
                          <Check size={10} className="absolute inset-0 m-auto text-white" strokeWidth={3} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end">
                  <motion.button
                    type="submit"
                    disabled={submitting || !formTitle.trim() || !formDate}
                    whileTap={{ scale: 0.97 }}
                    className="nv-button-primary disabled:opacity-40 flex items-center gap-2"
                  >
                    {submitting ? (
                      <div className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    ) : (
                      <Check size={13} />
                    )}
                    Create Event
                  </motion.button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 rounded-full border-2 border-nv-accent border-t-transparent animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-nv-surface/30 flex items-center justify-center mb-4">
              <CalendarDays size={28} className="text-nv-text-tertiary" />
            </div>
            <h3 className="text-base font-semibold text-nv-text-primary mb-1">No events yet</h3>
            <p className="text-sm text-nv-text-secondary">
              {isOwner ? 'Add the first event above.' : 'No events have been scheduled.'}
            </p>
          </motion.div>
        ) : viewMode === 'month' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-2 py-1.5">
              <button
                onClick={previousMonth}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06]"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-sm font-semibold text-nv-text-primary">{formatMonthTitle(visibleMonth)}</span>
              <button
                onClick={nextMonth}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06]"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="text-[10px] font-semibold uppercase tracking-wide text-nv-text-tertiary px-2 py-1">
                  {label}
                </div>
              ))}

              {monthGridDays.map((date) => {
                const dayKey = toDateKey(date);
                const dayEvents = eventsByDate.get(dayKey) || [];
                const inCurrentMonth = date.getMonth() === visibleMonth.getMonth();
                const isToday = toDateKey(date) === toDateKey(new Date());

                return (
                  <div
                    key={dayKey}
                    className={`min-h-[120px] rounded-xl border px-2 py-1.5 ${
                      inCurrentMonth
                        ? 'border-white/[0.08] bg-white/[0.03]'
                        : 'border-white/[0.04] bg-black/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-semibold ${inCurrentMonth ? 'text-nv-text-primary' : 'text-nv-text-tertiary/60'}`}>
                        {date.getDate()}
                      </span>
                      {isToday && <span className="w-1.5 h-1.5 rounded-full bg-nv-accent" />}
                    </div>

                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          title={`${event.title} · by ${creatorLabel(event)}`}
                          className="rounded-md px-1.5 py-1 text-[10px] leading-tight border border-white/[0.06] bg-white/[0.04]"
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: event.color || '#007AFF' }} />
                            <span className="text-nv-text-primary truncate">{event.title}</span>
                          </div>
                          <p className="text-nv-text-tertiary truncate">by {creatorLabel(event)}</p>
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <p className="text-[10px] text-nv-text-tertiary px-1">+{dayEvents.length - 3} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {upcoming.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-nv-text-tertiary px-1 mb-2">Upcoming</p>
                <div className="space-y-2">
                  {upcoming.map((event) => (
                    <EventCard key={event.id} event={event} isOwner={isOwner} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            )}
            {past.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-nv-text-tertiary px-1 mb-2">Past</p>
                <div className="space-y-2 opacity-60">
                  {past.map((event) => (
                    <EventCard key={event.id} event={event} isOwner={isOwner} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EventCard({ event, isOwner, onDelete }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] group hover:bg-white/[0.05] transition-all"
    >
      <div
        className="w-3 h-3 rounded-full mt-1 shrink-0"
        style={{ backgroundColor: event.color || '#007AFF' }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-nv-text-primary truncate">{event.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Clock size={10} className="text-nv-text-tertiary shrink-0" />
          <span className="text-[11px] text-nv-text-tertiary">{formatEventDate(event.start_date)}</span>
        </div>
        <p className="text-[11px] text-nv-text-tertiary mt-1">Created by {creatorLabel(event)}</p>
        {event.description && (
          <p className="text-xs text-nv-text-secondary mt-1 line-clamp-2">{event.description}</p>
        )}
      </div>
      {isOwner && (
        <button
          onClick={() => onDelete(event.id)}
          className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 text-nv-text-tertiary hover:text-nv-danger hover:bg-nv-danger/10 transition-all shrink-0"
        >
          <Trash2 size={13} />
        </button>
      )}
    </motion.div>
  );
}
