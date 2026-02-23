import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Server, Hash, Volume2, FolderOpen, Trash2, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';

const COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF',
  '#5856D6', '#AF52DE', '#FF2D55', '#5AC8FA', '#64D2FF',
];

// ── Sub-component: channel row inside settings ─────────────────────────────

function ChannelRow({ channel, serverId, onUpdate }) {
  const { activeServerApi } = useApp();
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(channel.name);
  const [deleting, setDeleting] = useState(false);

  const submitRename = async () => {
    if (!nameValue.trim() || nameValue.trim() === channel.name) {
      setRenaming(false);
      setNameValue(channel.name);
      return;
    }
    try {
      await activeServerApi.updateChannel(serverId, channel.id, { name: nameValue.trim() });
      await onUpdate();
    } catch (err) {
      console.error(err);
      setNameValue(channel.name);
    }
    setRenaming(false);
  };

  const handleDelete = async () => {
    if (!deleting) { setDeleting(true); return; }
    try {
      await activeServerApi.deleteChannel(serverId, channel.id);
      await onUpdate();
    } catch (err) {
      console.error(err);
    }
    setDeleting(false);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/[0.03] group transition-all">
      {channel.type === 'voice' ? (
        <Volume2 size={13} className="text-nv-text-tertiary shrink-0" />
      ) : (
        <Hash size={13} className="text-nv-text-tertiary shrink-0" />
      )}

      {renaming ? (
        <input
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitRename();
            if (e.key === 'Escape') { setRenaming(false); setNameValue(channel.name); }
          }}
          className="flex-1 text-sm bg-white/10 rounded-lg px-2 py-0.5 outline-none border border-nv-accent/50"
          autoFocus
        />
      ) : (
        <span
          className="text-sm text-nv-text-secondary flex-1 cursor-text"
          onDoubleClick={() => setRenaming(true)}
        >
          {channel.name}
        </span>
      )}

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!renaming && (
          <button
            onClick={() => setRenaming(true)}
            className="text-[10px] text-nv-text-tertiary hover:text-nv-text-secondary px-2 py-0.5 rounded-lg hover:bg-white/[0.06] transition-all"
          >
            Rename
          </button>
        )}
        <button
          onClick={handleDelete}
          className={`text-[10px] px-2 py-0.5 rounded-lg transition-all ${
            deleting
              ? 'text-white bg-nv-danger'
              : 'text-nv-danger/70 hover:text-nv-danger hover:bg-nv-danger/10'
          }`}
        >
          {deleting ? 'Confirm' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

// ── Main ServerSettingsModal ───────────────────────────────────────────────

export default function ServerSettingsModal({
  isOpen,
  onClose,
  server,
  channels,
  categories,
  serverId,
  onUpdate,
}) {
  const { activeServerApi } = useApp();
  const [tab, setTab] = useState('overview');
  const [name, setName] = useState('');
  const [iconColor, setIconColor] = useState('#007AFF');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (server) {
      setName(server.name || '');
      setIconColor(server.icon_color || '#007AFF');
    }
  }, [server, isOpen]);

  // Reset tab on open
  useEffect(() => {
    if (isOpen) setTab('overview');
  }, [isOpen]);

  const handleSave = async () => {
    if (!name.trim() || name.trim().length < 2) return;
    setSaving(true);
    try {
      await activeServerApi.updateServer(serverId, {
        name: name.trim(),
        icon_color: iconColor,
      });
      await onUpdate();
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Server },
    { id: 'channels', label: 'Channels', icon: Hash },
  ];

  const uncategorized = channels.filter((c) => !c.category_id);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={onClose}
          onKeyDown={handleKeyDown}
        >
          {/* Backdrop — same as Modal.jsx */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 flex w-full max-w-[680px] mx-4 rounded-2xl overflow-hidden border border-white/[0.07] shadow-[0_40px_100px_rgba(0,0,0,0.7)]"
            style={{ height: 500 }}
          >
            {/* ── Left sidebar ──────────────────────────────────────────── */}
            <div className="w-[192px] shrink-0 bg-[#1a1a1f] flex flex-col border-r border-white/[0.05]">
              {/* Server identity */}
              <div className="px-4 py-4 border-b border-white/[0.05]">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-lg"
                    style={{ backgroundColor: iconColor }}
                  >
                    {(name || server?.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-nv-text-primary truncate leading-tight">
                      {name || server?.name}
                    </p>
                    <p className="text-[10px] text-nv-text-tertiary mt-0.5">Server Settings</p>
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <nav className="flex-1 px-2 py-3 space-y-0.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-nv-text-tertiary/60 px-2 pb-1.5">
                  Configuration
                </p>
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={[
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm transition-all duration-150 text-left',
                      tab === id
                        ? 'bg-white/[0.09] text-nv-text-primary font-medium'
                        : 'text-nv-text-secondary hover:bg-white/[0.04] hover:text-nv-text-primary',
                    ].join(' ')}
                  >
                    <Icon size={14} className="shrink-0" />
                    {label}
                  </button>
                ))}
              </nav>
            </div>

            {/* ── Right content ──────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col bg-[#161619] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05] shrink-0">
                <h2 className="text-[15px] font-semibold text-nv-text-primary tracking-tight">
                  {tab === 'overview' ? 'Server Overview' : 'Channel Management'}
                </h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.07] transition-all"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto">
                {/* ── Overview tab ──────────────────────────────────────── */}
                {tab === 'overview' && (
                  <div className="px-6 py-5 space-y-7">
                    {/* Server name */}
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-nv-text-tertiary block mb-2">
                        Server Name
                      </label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Server name"
                        className="nv-input"
                        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                      />
                    </div>

                    {/* Color picker */}
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-nv-text-tertiary block mb-3">
                        Server Color
                      </label>
                      <div className="flex flex-wrap gap-2.5">
                        {COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => setIconColor(color)}
                            className="relative w-8 h-8 rounded-[10px] transition-all duration-150 hover:scale-110"
                            style={{ backgroundColor: color }}
                          >
                            {iconColor === color && (
                              <motion.div
                                initial={{ scale: 0.6, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ duration: 0.15 }}
                                className="absolute inset-0 flex items-center justify-center"
                              >
                                <div className="w-full h-full rounded-[10px] ring-2 ring-white ring-offset-2 ring-offset-[#161619]" />
                                <Check size={12} className="absolute text-white drop-shadow-sm" strokeWidth={3} />
                              </motion.div>
                            )}
                          </button>
                        ))}
                      </div>

                      {/* Live preview */}
                      <div className="mt-5 flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                        <motion.div
                          animate={{ backgroundColor: iconColor }}
                          transition={{ duration: 0.2 }}
                          className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-lg font-bold shadow-lg"
                        >
                          {(name || server?.name || '?')[0].toUpperCase()}
                        </motion.div>
                        <div>
                          <p className="text-sm font-semibold text-nv-text-primary">
                            {name || server?.name}
                          </p>
                          <p className="text-[11px] text-nv-text-tertiary mt-0.5">Live Preview</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Channels tab ──────────────────────────────────────── */}
                {tab === 'channels' && (
                  <div className="px-4 py-4 space-y-1">
                    {/* Uncategorized channels */}
                    {uncategorized.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-nv-text-tertiary/60 px-3 pb-1.5">
                          Uncategorized
                        </p>
                        {uncategorized.map((ch) => (
                          <ChannelRow key={ch.id} channel={ch} serverId={serverId} onUpdate={onUpdate} />
                        ))}
                      </div>
                    )}

                    {/* Categories with their channels */}
                    {categories.map((cat) => {
                      const catChannels = channels.filter((c) => c.category_id === cat.id);
                      return (
                        <div key={cat.id} className="mb-3">
                          <div className="flex items-center gap-2 px-3 py-1.5">
                            <FolderOpen size={12} className="text-nv-text-tertiary shrink-0" />
                            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-nv-text-secondary">
                              {cat.name}
                            </span>
                            <span className="ml-auto text-[10px] text-nv-text-tertiary/50">
                              {catChannels.length} channel{catChannels.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="pl-2">
                            {catChannels.map((ch) => (
                              <ChannelRow key={ch.id} channel={ch} serverId={serverId} onUpdate={onUpdate} />
                            ))}
                            {catChannels.length === 0 && (
                              <p className="text-[11px] text-nv-text-tertiary/40 px-5 py-1 italic">
                                Empty category
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {channels.length === 0 && categories.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Hash size={28} className="text-nv-text-tertiary/30 mb-3" />
                        <p className="text-sm text-nv-text-tertiary">No channels yet</p>
                        <p className="text-xs text-nv-text-tertiary/50 mt-1">
                          Create channels from the sidebar
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer — overview only */}
              {tab === 'overview' && (
                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-white/[0.05] shrink-0">
                  <button onClick={onClose} className="nv-button-ghost">
                    Cancel
                  </button>
                  <motion.button
                    onClick={handleSave}
                    disabled={saving || !name.trim() || name.trim().length < 2}
                    whileTap={{ scale: 0.97 }}
                    className="nv-button-primary disabled:opacity-40 flex items-center gap-2 min-w-[120px] justify-center"
                  >
                    {saving ? (
                      <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    ) : saved ? (
                      <>
                        <Check size={14} />
                        Saved
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
