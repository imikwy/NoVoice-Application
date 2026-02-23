import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Hash,
  Volume2,
  Plus,
  Trash2,
  Copy,
  Check,
  LogOut,
  ChevronDown,
  Settings,
  FolderPlus,
  Phone,
  GripVertical,
  Megaphone,
  BookOpen,
  CalendarDays,
  ListTodo,
  MessagesSquare,
} from 'lucide-react';

const CHANNEL_TYPE_ICONS = {
  text: Hash,
  voice: Volume2,
  announcements: Megaphone,
  rules: BookOpen,
  calendar: CalendarDays,
  tasks: ListTodo,
  forum: MessagesSquare,
};

const CHANNEL_TYPE_OPTIONS = [
  { type: 'text',          Icon: Hash,            label: 'Text',          desc: 'Chat with text messages' },
  { type: 'voice',         Icon: Volume2,          label: 'Voice',         desc: 'Talk with voice' },
  { type: 'announcements', Icon: Megaphone,        label: 'Announcements', desc: 'Owner-only posts' },
  { type: 'rules',         Icon: BookOpen,         label: 'Rules',         desc: 'Server rules & info' },
  { type: 'calendar',      Icon: CalendarDays,     label: 'Calendar',      desc: 'Schedule events' },
  { type: 'tasks',         Icon: ListTodo,         label: 'Tasks',         desc: 'Manage task lists' },
  { type: 'forum',         Icon: MessagesSquare,   label: 'Forum',         desc: 'Threaded discussions' },
];
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import Modal from './Modal';
import ServerSettingsModal from './ServerSettingsModal';
import UserAvatar from './UserAvatar';

export default function ServerChannels() {
  const { user } = useAuth();
  const {
    activeView,
    activeChannel,
    setActiveChannel,
    serverDetails,
    loadServerDetails,
    refreshServers,
    setActiveView,
    voiceChannelOccupancy,
    voiceChannelParticipants,
    activeServerApi,
  } = useApp();
  const { activeVoiceChannelId, joinVoice } = useVoice();

  const serverId = activeView?.id;
  const details = serverDetails[serverId];
  const server = details?.server;
  const isOwner = server?.owner_id === user?.id;

  // Local copies for optimistic drag-drop reordering
  const [localChannels, setLocalChannels] = useState([]);
  const [localCategories, setLocalCategories] = useState([]);

  useEffect(() => {
    const chs = details?.channels || [];
    const cats = details?.categories || [];
    setLocalChannels([...chs].sort((a, b) => a.position - b.position));
    setLocalCategories([...cats].sort((a, b) => a.position - b.position));
  }, [details]);

  // Collapsed state per category id
  const [collapsed, setCollapsed] = useState(new Set());

  // Drag & drop state
  const [dragging, setDragging] = useState(null); // { id, type: 'channel'|'category' }
  const [dragOverId, setDragOverId] = useState(null);

  // Inline rename state
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef(null);
  const renameCancelledRef = useRef(false);

  // Modals
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [createChannelType, setCreateChannelType] = useState('text');
  const [createChannelCategoryId, setCreateChannelCategoryId] = useState(null);
  const [newChannelName, setNewChannelName] = useState('');

  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [showSettings, setShowSettings] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  useEffect(() => {
    if (serverId && !details) loadServerDetails(serverId);
  }, [serverId]);

  // Auto-select first text channel
  useEffect(() => {
    const textChannels = localChannels.filter((c) => c.type === 'text');
    if (textChannels.length > 0 && !activeChannel) {
      setActiveChannel(textChannels[0]);
    }
  }, [localChannels]);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleCopyInvite = async () => {
    if (server?.invite_code) {
      await navigator.clipboard.writeText(server.invite_code);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    }
  };

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    try {
      await activeServerApi.createChannel(serverId, newChannelName.trim(), createChannelType, createChannelCategoryId);
      await loadServerDetails(serverId);
      setNewChannelName('');
      setCreateChannelOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    try {
      await activeServerApi.createCategory(serverId, newCategoryName.trim());
      await loadServerDetails(serverId);
      setNewCategoryName('');
      setCreateCategoryOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteChannel = async (channelId) => {
    try {
      await activeServerApi.deleteChannel(serverId, channelId);
      if (activeChannel?.id === channelId) setActiveChannel(null);
      await loadServerDetails(serverId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    try {
      await activeServerApi.deleteCategory(serverId, categoryId);
      await loadServerDetails(serverId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLeaveServer = async () => {
    try {
      if (isOwner) await activeServerApi.deleteServer(serverId);
      else await activeServerApi.leaveServer(serverId);
      await refreshServers();
      setActiveView(null);
      setActiveChannel(null);
    } catch (err) {
      console.error(err);
    }
  };

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  const handleDragStart = (e, id, type) => {
    // Only allow drag from the grip handle icon
    if (!e.target.closest('[data-drag-handle]')) {
      e.preventDefault();
      return;
    }
    setDragging({ id, type });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== id) setDragOverId(id);
  };

  const handleDragEnd = () => {
    setDragging(null);
    setDragOverId(null);
  };

  const persistReorder = useCallback(async (newChs, newCats) => {
    try {
      await activeServerApi.reorderItems(serverId, {
        channels: newChs.map((c) => ({
          id: c.id,
          position: c.position,
          category_id: c.category_id ?? null,
        })),
        categories: newCats.map((c) => ({ id: c.id, position: c.position })),
      });
    } catch (err) {
      console.error(err);
      loadServerDetails(serverId);
    }
  }, [activeServerApi, serverId, loadServerDetails]);

  const handleDrop = (e, targetId, targetType) => {
    e.preventDefault();
    e.stopPropagation();

    if (!dragging || dragging.id === targetId) {
      setDragging(null);
      setDragOverId(null);
      return;
    }

    let newChannels = [...localChannels];
    let newCategories = [...localCategories];

    if (dragging.type === 'channel' && targetType === 'channel') {
      const dragIdx = newChannels.findIndex((c) => c.id === dragging.id);
      const targetIdx = newChannels.findIndex((c) => c.id === targetId);
      if (dragIdx >= 0 && targetIdx >= 0) {
        const targetCategory = newChannels[targetIdx].category_id;
        const [item] = newChannels.splice(dragIdx, 1);
        const insertIdx = newChannels.findIndex((c) => c.id === targetId);
        newChannels.splice(insertIdx >= 0 ? insertIdx : newChannels.length, 0, {
          ...item,
          category_id: targetCategory,
        });
        newChannels = newChannels.map((c, i) => ({ ...c, position: i }));
      }
    } else if (dragging.type === 'channel' && targetType === 'category') {
      const newCatId = targetId === '__none__' ? null : targetId;
      newChannels = newChannels.map((c) =>
        c.id === dragging.id ? { ...c, category_id: newCatId } : c
      );
    } else if (dragging.type === 'category' && targetType === 'category') {
      const dragIdx = newCategories.findIndex((c) => c.id === dragging.id);
      const targetIdx = newCategories.findIndex((c) => c.id === targetId);
      if (dragIdx >= 0 && targetIdx >= 0) {
        const [item] = newCategories.splice(dragIdx, 1);
        const insertIdx = newCategories.findIndex((c) => c.id === targetId);
        newCategories.splice(insertIdx >= 0 ? insertIdx : newCategories.length, 0, item);
        newCategories = newCategories.map((c, i) => ({ ...c, position: i }));
      }
    }

    setLocalChannels(newChannels);
    setLocalCategories(newCategories);
    setDragging(null);
    setDragOverId(null);
    persistReorder(newChannels, newCategories);
  };

  // ── Inline Rename ──────────────────────────────────────────────────────────

  const startRename = (e, id, currentName) => {
    e.preventDefault();
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const submitRename = async () => {
    // Cancelled via Escape — don't save
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false;
      return;
    }
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null);
      setRenameValue('');
      return;
    }
    const idToRename = renamingId;
    const nameToSave = renameValue.trim();
    const isCategory = localCategories.some((c) => c.id === idToRename);
    try {
      if (isCategory) {
        await activeServerApi.updateCategory(serverId, idToRename, nameToSave);
      } else {
        await activeServerApi.updateChannel(serverId, idToRename, { name: nameToSave });
      }
      await loadServerDetails(serverId);
      setRenamingId(null);
      setRenameValue('');
    } catch (err) {
      console.error('Rename failed:', err);
      // Keep rename input open on failure so the user can retry
    }
  };

  const handleRenameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Blur triggers onBlur → submitRename (prevents double-call)
      renameRef.current?.blur();
    }
    if (e.key === 'Escape') {
      renameCancelledRef.current = true;
      setRenamingId(null);
      setRenameValue('');
    }
  };

  // ── Voice quick join ───────────────────────────────────────────────────────

  const handleQuickJoinVoice = (e, channel) => {
    e.stopPropagation();
    setActiveChannel(channel);
    joinVoice(channel.id);
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderChannelRow = (channel) => {
    const isActive = activeChannel?.id === channel.id;
    const isVoiceActive = activeVoiceChannelId === channel.id;
    const occupancy = voiceChannelOccupancy.get(channel.id) || 0;
    const voiceUsers = channel.type === 'voice' ? (voiceChannelParticipants.get(channel.id) || []) : [];
    const isDraggingThis = dragging?.id === channel.id;
    const isDropTarget = dragOverId === channel.id && dragging?.id !== channel.id;

    return (
      <div key={channel.id}>
      <div
        draggable={isOwner}
        onDragStart={(e) => handleDragStart(e, channel.id, 'channel')}
        onDragOver={(e) => handleDragOver(e, channel.id)}
        onDrop={(e) => handleDrop(e, channel.id, 'channel')}
        onDragEnd={handleDragEnd}
        onClick={() => setActiveChannel(channel)}
        onDoubleClick={(e) => isOwner && startRename(e, channel.id, channel.name)}
        className={[
          'flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-150 group select-none',
          isActive
            ? 'bg-white/[0.08] text-nv-text-primary'
            : 'text-nv-text-secondary hover:bg-white/[0.04] hover:text-nv-text-primary',
          isDraggingThis ? 'opacity-30' : '',
          isDropTarget ? 'ring-1 ring-nv-accent/50 bg-nv-accent/[0.06]' : '',
        ].join(' ')}
      >
        {isOwner && (
          <span data-drag-handle="true" className="shrink-0 flex items-center">
            <GripVertical
              size={11}
              className="text-nv-text-tertiary opacity-0 group-hover:opacity-40 cursor-grab transition-opacity"
            />
          </span>
        )}

        {(() => { const CIcon = CHANNEL_TYPE_ICONS[channel.type] || Hash; return <CIcon size={13} className="shrink-0 text-nv-text-tertiary" />; })()}

        {isVoiceActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-nv-accent shadow-[0_0_6px_rgba(52,199,89,0.7)] shrink-0" />
        )}

        {renamingId === channel.id ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={submitRename}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 text-sm bg-white/10 rounded px-1 py-0 outline-none border border-nv-accent/50 min-w-0"
          />
        ) : (
          <span className="text-sm truncate flex-1">{channel.name}</span>
        )}

        {channel.type === 'voice' && occupancy > 0 && (
          <span className="text-[10px] text-nv-text-tertiary shrink-0 mr-0.5">{occupancy}</span>
        )}

        {channel.type === 'voice' && (
          <button
            onClick={(e) => handleQuickJoinVoice(e, channel)}
            className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-nv-accent/20 text-nv-text-tertiary hover:text-nv-accent transition-all shrink-0"
            title="Join voice"
          >
            <Phone size={10} />
          </button>
        )}

        {isOwner && (
          <button
            onClick={(e) => { e.stopPropagation(); handleDeleteChannel(channel.id); }}
            className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-nv-danger/20 text-nv-text-tertiary hover:text-nv-danger transition-all shrink-0"
            title="Delete channel"
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>
      {/* Voice channel participants */}
      {channel.type === 'voice' && voiceUsers.length > 0 && (
        <div className="pl-6 pb-0.5 space-y-0.5">
          {voiceUsers.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg">
              <UserAvatar user={p} size="xs" showStatus={false} />
              <span className="text-xs text-nv-text-tertiary truncate">
                {p.display_name || p.username}
              </span>
            </div>
          ))}
        </div>
      )}
      </div>
    );
  };

  const renderCategorySection = (category) => {
    const isCollapsed = collapsed.has(category.id);
    const isDraggingThis = dragging?.id === category.id;
    const isDropTarget = dragOverId === category.id;
    const categoryChannels = localChannels.filter((c) => c.category_id === category.id);

    const toggleCollapse = () => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        isCollapsed ? next.delete(category.id) : next.add(category.id);
        return next;
      });
    };

    return (
      <div
        key={category.id}
        onDragOver={(e) => {
          e.preventDefault();
          handleDragOver(e, category.id);
        }}
        onDrop={(e) => {
          if (dragging?.type === 'channel') handleDrop(e, category.id, 'category');
          else handleDrop(e, category.id, 'category');
        }}
      >
        {/* Category header row */}
        <div
          draggable={isOwner}
          onDragStart={(e) => handleDragStart(e, category.id, 'category')}
          onDragEnd={handleDragEnd}
          className={[
            'flex items-center gap-1.5 px-1.5 py-1 rounded text-nv-text-tertiary hover:text-nv-text-secondary transition-colors group select-none mt-2',
            isDraggingThis ? 'opacity-30' : '',
            isDropTarget && dragging?.type === 'category' ? 'bg-white/[0.05]' : '',
          ].join(' ')}
        >
          {isOwner && (
            <span data-drag-handle="true" className="shrink-0 flex items-center">
              <GripVertical
                size={10}
                className="opacity-0 group-hover:opacity-40 cursor-grab transition-opacity"
              />
            </span>
          )}

          <motion.div
            animate={{ rotate: isCollapsed ? -90 : 0 }}
            transition={{ duration: 0.15 }}
            onClick={toggleCollapse}
            className="cursor-pointer"
          >
            <ChevronDown size={12} />
          </motion.div>

          {renamingId === category.id ? (
            <input
              ref={renameRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={submitRename}
              onKeyDown={handleRenameKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 text-[10px] font-semibold uppercase tracking-wider bg-white/10 rounded px-1 py-0 outline-none border border-nv-accent/50 min-w-0"
            />
          ) : (
            <span
              className="text-[10px] font-semibold uppercase tracking-wider flex-1 cursor-pointer"
              onClick={toggleCollapse}
              onDoubleClick={(e) => isOwner && startRename(e, category.id, category.name)}
            >
              {category.name}
            </span>
          )}

          {isOwner && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCreateChannelCategoryId(category.id);
                  setCreateChannelOpen(true);
                }}
                className="w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all shrink-0"
                title="Add channel"
              >
                <Plus size={10} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id); }}
                className="w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-nv-danger/20 text-nv-text-tertiary hover:text-nv-danger transition-all shrink-0"
                title="Delete category"
              >
                <Trash2 size={10} />
              </button>
            </>
          )}
        </div>

        {/* Channels inside category */}
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden pl-1"
            >
              {categoryChannels.map((ch) => renderChannelRow(ch))}
              {categoryChannels.length === 0 && (
                <p className="text-[10px] text-nv-text-tertiary/50 px-4 py-1 italic">Empty</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (!server) {
    return (
      <div className="w-[220px] bg-nv-channels h-full flex items-center justify-center shrink-0">
        <div className="w-5 h-5 rounded-full border-2 border-nv-text-tertiary border-t-transparent animate-spin" />
      </div>
    );
  }

  const uncategorizedChannels = localChannels.filter((c) => !c.category_id);

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 220, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="h-full bg-nv-channels flex flex-col shrink-0 border-l border-white/[0.04]"
    >
      {/* Server header */}
      <div className="px-4 pt-3 pb-2 border-b border-white/[0.04]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-nv-text-primary truncate">{server.name}</h3>
          <button
            onClick={handleCopyInvite}
            className="w-6 h-6 rounded-md flex items-center justify-center text-nv-text-tertiary hover:text-nv-text-secondary hover:bg-white/5 transition-all"
            title="Copy invite code"
          >
            {copiedInvite ? (
              <Check size={12} className="text-nv-accent" />
            ) : (
              <Copy size={12} />
            )}
          </button>
        </div>
        <p className="text-[10px] text-nv-text-tertiary mt-0.5">
          {details?.members?.length || 0} members
        </p>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 py-2" onDragOver={(e) => e.preventDefault()}>
        {/* Uncategorized channels */}
        {uncategorizedChannels.length > 0 && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (dragging?.type === 'channel') setDragOverId('__none__');
            }}
            onDrop={(e) => {
              e.stopPropagation();
              if (dragging?.type === 'channel') handleDrop(e, '__none__', 'category');
            }}
            className={[
              'rounded-lg transition-all',
              dragOverId === '__none__' ? 'bg-nv-accent/[0.04]' : '',
            ].join(' ')}
          >
            {uncategorizedChannels.map((ch) => renderChannelRow(ch))}
          </div>
        )}

        {/* Categories */}
        {localCategories.map((cat) => renderCategorySection(cat))}

        {localChannels.length === 0 && localCategories.length === 0 && (
          <p className="text-xs text-nv-text-tertiary text-center py-4">No channels yet</p>
        )}
      </div>

      {/* Bottom admin bar — owner only */}
      {isOwner && (
        <div className="border-t border-white/[0.04] px-2 py-1.5 flex items-center gap-0.5">
          <button
            onClick={() => { setCreateChannelCategoryId(null); setCreateChannelOpen(true); }}
            className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-nv-text-tertiary hover:text-nv-text-secondary hover:bg-white/[0.04] transition-all"
            title="New channel"
          >
            <Plus size={12} />
            <span className="text-[9px] font-medium">Channel</span>
          </button>
          <button
            onClick={() => setCreateCategoryOpen(true)}
            className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-nv-text-tertiary hover:text-nv-text-secondary hover:bg-white/[0.04] transition-all"
            title="New category"
          >
            <FolderPlus size={12} />
            <span className="text-[9px] font-medium">Category</span>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-nv-text-tertiary hover:text-nv-text-secondary hover:bg-white/[0.04] transition-all"
            title="Server settings"
          >
            <Settings size={12} />
            <span className="text-[9px] font-medium">Edit</span>
          </button>
        </div>
      )}

      {/* Leave / Delete server */}
      <div className="border-t border-white/[0.04] p-2">
        <button
          onClick={handleLeaveServer}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-nv-text-tertiary hover:text-nv-danger hover:bg-nv-danger/10 transition-all duration-150 text-sm"
        >
          <LogOut size={14} />
          {isOwner ? 'Delete Server' : 'Leave Server'}
        </button>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      <Modal
        isOpen={createChannelOpen}
        onClose={() => setCreateChannelOpen(false)}
        title="Create Channel"
      >
        <form onSubmit={handleCreateChannel} className="space-y-4">
          <input
            type="text"
            placeholder="Channel name"
            value={newChannelName}
            onChange={(e) => setNewChannelName(e.target.value)}
            className="nv-input"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            {CHANNEL_TYPE_OPTIONS.map(({ type, Icon, label, desc }) => (
              <button
                key={type}
                type="button"
                onClick={() => setCreateChannelType(type)}
                className={`flex items-start gap-3 p-3 rounded-xl text-left transition-all ${
                  createChannelType === type
                    ? 'bg-nv-accent/10 border border-nv-accent/40 text-nv-accent'
                    : 'bg-nv-surface/30 border border-nv-border/20 text-nv-text-secondary hover:bg-nv-surface/50 hover:text-nv-text-primary'
                }`}
              >
                <Icon size={16} className="shrink-0 mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-tight">{label}</span>
                  <span className="block text-[11px] opacity-60 leading-snug mt-0.5">{desc}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreateChannelOpen(false)} className="nv-button-ghost">
              Cancel
            </button>
            <motion.button
              type="submit"
              disabled={!newChannelName.trim()}
              whileTap={{ scale: 0.97 }}
              className="nv-button-primary disabled:opacity-40"
            >
              Create
            </motion.button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={createCategoryOpen}
        onClose={() => setCreateCategoryOpen(false)}
        title="Create Category"
      >
        <form onSubmit={handleCreateCategory} className="space-y-4">
          <input
            type="text"
            placeholder="Category name"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            className="nv-input"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreateCategoryOpen(false)} className="nv-button-ghost">
              Cancel
            </button>
            <motion.button
              type="submit"
              disabled={!newCategoryName.trim()}
              whileTap={{ scale: 0.97 }}
              className="nv-button-primary disabled:opacity-40"
            >
              Create
            </motion.button>
          </div>
        </form>
      </Modal>

      <ServerSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        server={server}
        channels={localChannels}
        categories={localCategories}
        serverId={serverId}
        onUpdate={() => loadServerDetails(serverId)}
      />
    </motion.div>
  );
}
