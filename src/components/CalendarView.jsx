import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, Plus, Trash2, X, Check, Clock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const EVENT_COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#FF2D55', '#5AC8FA', '#FFCC00'];

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function isUpcoming(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T00:00:00') >= today;
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

  const upcoming = events.filter((e) => isUpcoming(e.start_date));
  const past = events.filter((e) => !isUpcoming(e.start_date));

  return (
    <div className="flex-1 flex flex-col bg-nv-content min-w-0">
      {/* Header */}
      <div className="h-12 flex items-center px-4 border-b border-white/[0.05] shrink-0 gap-2">
        <CalendarDays size={16} className="text-nv-text-tertiary shrink-0" />
        <span className="text-sm font-semibold text-nv-text-primary truncate flex-1">
          {channel.name}
        </span>
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
        {/* Add event form */}
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
                {/* Color picker */}
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
        ) : (
          <div className="space-y-6">
            {upcoming.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-nv-text-tertiary px-1 mb-2">
                  Upcoming
                </p>
                <div className="space-y-2">
                  {upcoming.map((event) => (
                    <EventCard key={event.id} event={event} isOwner={isOwner} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            )}
            {past.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-nv-text-tertiary px-1 mb-2">
                  Past
                </p>
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
