import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Hash,
  Volume2,
  VolumeX,
  Users,
  PhoneCall,
  PhoneOff,
  Loader2,
  Mic,
  MicOff,
  Headphones,
  UsersRound,
  Megaphone,
  BookOpen,
  CalendarDays,
  ListTodo,
  MessagesSquare,
  ChevronDown,
  Check,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { useSocket } from '../context/SocketContext';
import { useVoice } from '../context/VoiceContext';
import UserAvatar from './UserAvatar';
import MessageInput from './MessageInput';
import MessageContent from './MessageContent';
import RulesView from './RulesView';
import CalendarView from './CalendarView';
import TasksView from './TasksView';
import ForumView from './ForumView';
import AnnouncementsView from './AnnouncementsView';

const CHANNEL_HEADER_ICONS = {
  text: Hash,
  announcements: Megaphone,
  rules: BookOpen,
  calendar: CalendarDays,
  tasks: ListTodo,
  forum: MessagesSquare,
};

function formatTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return `Yesterday at ${time}`;
  return `${d.toLocaleDateString()} ${time}`;
}

function shouldGroup(prev, curr) {
  if (!prev) return false;
  if (prev.sender_id !== curr.sender_id) return false;
  const diff = new Date(curr.created_at) - new Date(prev.created_at);
  return diff < 5 * 60 * 1000;
}

function compactDeviceLabel(label) {
  const cleaned = String(label || 'Unknown Device').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Unknown Device';
  return cleaned.length > 52 ? `${cleaned.slice(0, 52)}...` : cleaned;
}

function deviceSubLabel(device) {
  if (!device || device.id === 'default') return 'System default';
  return `Device ${device.id.slice(0, 8)}`;
}

export default function ChatArea({ onToggleMembers, showMembers }) {
  const { user } = useAuth();
  const { activeView, activeChannel, serverDetails, onlineUsers, activeServerApi, ownSocket, dmMessages } = useApp();
  const { socket } = useSocket();
  const {
    activeVoiceChannelId,
    voiceConnected,
    joiningVoice,
    voiceError,
    voiceParticipants,
    selfMuted,
    deafened,
    mutedUsers,
    joinVoice,
    leaveVoice,
    toggleSelfMute,
    toggleDeafen,
    toggleUserMute,
    inputDevices,
    outputDevices,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    inputGain,
    outputVolume,
    userVolumes,
    audioProcessing,
    voiceQualityMode,
    fecMode,
    lowLatencyMode,
    prioritizeVoicePackets,
    effectiveFecEnabled,
    targetAudioBitrate,
    voiceNetworkStats,
    voiceHealth,
    inputMode,
    pttKey,
    pttPressed,
    micTestEnabled,
    micTestLevel,
    setInputDevice,
    setOutputDevice,
    setInputGain,
    setOutputVolume,
    setUserVolume,
    setAudioProcessingOption,
    setVoiceQualityMode,
    setFecMode,
    setLowLatencyMode,
    setPrioritizeVoicePackets,
    setInputMode,
    setMicTestEnabled,
  } = useVoice();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showMicMenu, setShowMicMenu] = useState(false);
  const [showOutputMenu, setShowOutputMenu] = useState(false);
  const [showFxMenu, setShowFxMenu] = useState(false);
  const [showMicDeviceList, setShowMicDeviceList] = useState(false);
  const [showOutputDeviceList, setShowOutputDeviceList] = useState(false);

  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const activeConversationRef = useRef('none');
  const voiceControlsRef = useRef(null);

  const isDM = activeView?.type === 'friend';
  const isVoice = activeChannel?.type === 'voice';
  const isRules = activeChannel?.type === 'rules';
  const isCalendar = activeChannel?.type === 'calendar';
  const isTasks = activeChannel?.type === 'tasks';
  const isForum = activeChannel?.type === 'forum';
  const isAnnouncements = activeChannel?.type === 'announcements';
  const isInThisVoiceChannel = isVoice && activeVoiceChannelId === activeChannel?.id;
  const channelName = isDM ? activeView?.data?.display_name : activeChannel?.name;

  const activeConversationKey = isDM
    ? `dm:${activeView?.id || ''}`
    : activeChannel?.id
      ? `channel:${activeChannel.id}`
      : 'none';

  useEffect(() => {
    activeConversationRef.current = activeConversationKey;
  }, [activeConversationKey]);

  const loadMessages = useCallback(
    async (showLoader = false) => {
      // DMs come from AppContext in-memory store — no API call needed
      if (isDM) {
        if (showLoader) setLoading(false);
        return;
      }

      const conversationKey = activeConversationKey;
      const shouldLoadChannel = Boolean(activeChannel?.id) && !isVoice;

      if (!shouldLoadChannel) {
        setMessages([]);
        if (showLoader) setLoading(false);
        return;
      }

      if (showLoader) setLoading(true);

      try {
        const data = await activeServerApi.getMessages(activeChannel.id);
        if (activeConversationRef.current !== conversationKey) return;
        setMessages(data.messages || []);
      } catch (err) {
        if (activeConversationRef.current === conversationKey) {
          console.error(err);
        }
      } finally {
        if (showLoader && activeConversationRef.current === conversationKey) {
          setLoading(false);
        }
      }
    },
    [isDM, activeChannel?.id, isVoice, activeConversationKey, activeServerApi]
  );

  useEffect(() => {
    loadMessages(true);
  }, [loadMessages]);

  useEffect(() => {
    // DMs are real-time via socket (AppContext) — no polling needed
    if (isDM || !activeChannel?.id || isVoice) return;
    const intervalId = setInterval(() => loadMessages(false), 2000);
    return () => clearInterval(intervalId);
  }, [loadMessages, isDM, activeChannel?.id, isVoice]);

  // Socket listeners for channel messages and typing
  useEffect(() => {
    const handleNewMessage = ({ channelId }) => {
      if (activeChannel?.id === channelId) loadMessages(false);
    };

    const handleTyping = ({ userId, username, channelId, isDM: isDMTyping, isTyping }) => {
      if (userId === user.id) return;
      const isRelevant = isDMTyping
        ? isDM && userId === activeView?.id
        : channelId === activeChannel?.id;
      if (!isRelevant) return;

      setTypingUsers((prev) => {
        if (isTyping) {
          return prev.find((u) => u.userId === userId)
            ? prev
            : [...prev, { userId, username }];
        }
        return prev.filter((u) => u.userId !== userId);
      });
    };

    // Channel message events: own/local servers use ownSocket, NoVoice Cloud uses central socket
    socket?.on('message:new', handleNewMessage);
    ownSocket?.on('message:new', handleNewMessage);
    socket?.on('typing:update', handleTyping);

    return () => {
      socket?.off('message:new', handleNewMessage);
      ownSocket?.off('message:new', handleNewMessage);
      socket?.off('typing:update', handleTyping);
    };
  }, [socket, ownSocket, isDM, activeView?.id, activeChannel?.id, user?.id, loadMessages]);

  // Request voice state when viewing a voice channel
  useEffect(() => {
    if (!socket || !isVoice || !activeChannel?.id) return;
    socket.emit('voice:state:request', { channelId: activeChannel.id });
  }, [socket, isVoice, activeChannel?.id]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(
    (content) => {
      if (!content.trim()) return;
      if (isDM) {
        socket?.emit('dm:send', { receiverId: activeView.id, content });
      } else if (activeChannel) {
        socket?.emit('message:send', { channelId: activeChannel.id, content });
      }
    },
    [socket, isDM, activeView?.id, activeChannel?.id]
  );

  const handleJoinVoice = useCallback(() => {
    if (activeChannel?.id) joinVoice(activeChannel.id);
  }, [activeChannel?.id, joinVoice]);

  const handleLeaveVoice = useCallback(() => {
    leaveVoice(true);
    if (socket && activeChannel?.id) {
      socket.emit('voice:state:request', { channelId: activeChannel.id });
    }
  }, [leaveVoice, socket, activeChannel?.id]);

  useEffect(() => {
    if (!showMicMenu && !showOutputMenu && !showFxMenu) return;
    const handler = (event) => {
      if (!voiceControlsRef.current) return;
      if (!voiceControlsRef.current.contains(event.target)) {
        setShowMicMenu(false);
        setShowOutputMenu(false);
        setShowFxMenu(false);
        setShowMicDeviceList(false);
        setShowOutputDeviceList(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMicMenu, showOutputMenu, showFxMenu]);

  useEffect(() => {
    if (!showMicMenu) setShowMicDeviceList(false);
  }, [showMicMenu]);

  useEffect(() => {
    if (!showOutputMenu) setShowOutputDeviceList(false);
  }, [showOutputMenu]);

  // DMs come from AppContext in-memory store; channel messages from local state
  const currentMessages = isDM ? (dmMessages[activeView?.id] || []) : messages;

  const serverObj = serverDetails[activeView?.id]?.server;
  const isOwner = serverObj?.owner_id === user?.id;

  // ── Special channel type routing ──────────────────────────────────────────
  if (isRules) {
    return <RulesView channel={activeChannel} serverId={activeView?.id} onToggleMembers={onToggleMembers} showMembers={showMembers} />;
  }
  if (isCalendar) {
    return <CalendarView channel={activeChannel} serverId={activeView?.id} />;
  }
  if (isTasks) {
    return (
      <TasksView
        channel={activeChannel}
        serverId={activeView?.id}
        onToggleMembers={onToggleMembers}
        showMembers={showMembers}
      />
    );
  }
  if (isForum) {
    return <ForumView channel={activeChannel} serverId={activeView?.id} />;
  }
  if (isAnnouncements) {
    return <AnnouncementsView channel={activeChannel} serverId={activeView?.id} />;
  }

  // Voice channel view
  if (isVoice) {
    const details = serverDetails[activeView?.id];
    const members = details?.members || [];
    const participantIds = new Set(voiceParticipants.map((p) => p.id));
    const selectedInputDevice = inputDevices.find((device) => device.id === selectedInputDeviceId) || inputDevices[0];
    const selectedOutputDevice = outputDevices.find((device) => device.id === selectedOutputDeviceId) || outputDevices[0];
    const audioFxOptions = [
      {
        key: 'echoCancellation',
        label: 'Echo Cancellation',
        description: 'Reduce speaker feedback loops',
      },
      {
        key: 'noiseSuppression',
        label: 'Noise Suppression',
        description: 'Filter constant background noise',
      },
      {
        key: 'autoGainControl',
        label: 'Auto Gain Control',
        description: 'Stabilize voice loudness automatically',
      },
      {
        key: 'highpassFilter',
        label: 'Highpass Filter',
        description: 'Remove low-end rumble and hum',
      },
    ];
    const qualityOptions = [
      { key: 'auto', label: 'Auto', subLabel: 'Adaptive' },
      { key: 'high', label: 'High', subLabel: 'Stable HQ' },
      { key: 'extreme', label: 'Extreme', subLabel: 'Max bandwidth' },
    ];
    const fecOptions = [
      { key: 'auto', label: 'Auto' },
      { key: 'on', label: 'On' },
      { key: 'off', label: 'Off' },
    ];
    const enabledFxCount = audioFxOptions.reduce(
      (count, option) => count + (audioProcessing?.[option.key] ? 1 : 0),
      0
    );
    const activeQualityLabel = qualityOptions.find((option) => option.key === voiceQualityMode)?.label || 'Auto';
    const activeBitrateKbps = Math.round(Math.max(64, Number(targetAudioBitrate || 192000)) / 1000);
    const hasRemoteVoicePeers = voiceParticipants.some((participant) => participant.id !== user?.id);
    const liveBitrateText = Number.isFinite(voiceNetworkStats?.measuredBitrateKbps)
      ? `Live ${voiceNetworkStats.measuredBitrateKbps} kbps`
      : hasRemoteVoicePeers
        ? 'Live ...'
        : 'Live --';
    const lossText = Number.isFinite(voiceNetworkStats?.packetLossPercent)
      ? `${voiceNetworkStats.packetLossPercent}%`
      : hasRemoteVoicePeers
        ? '...'
        : '--';
    const jitterText = Number.isFinite(voiceNetworkStats?.jitterMs)
      ? `${voiceNetworkStats.jitterMs} ms`
      : hasRemoteVoicePeers
        ? '...'
        : '--';
    const rttText = Number.isFinite(voiceNetworkStats?.rttMs)
      ? `${voiceNetworkStats.rttMs} ms`
      : hasRemoteVoicePeers
        ? '...'
        : '--';
    const effectiveLocalMuted = selfMuted || (inputMode === 'ptt' && !pttPressed);
    const micButtonLabel = inputMode === 'ptt'
      ? (pttPressed && !selfMuted ? 'Talking' : 'PTT')
      : (selfMuted ? 'Muted' : 'Mic');
    const voiceHealthToneClass = voiceHealth?.level === 'good'
      ? 'text-nv-accent border-nv-accent/30 bg-nv-accent/10'
      : voiceHealth?.level === 'fair'
        ? 'text-nv-warning border-nv-warning/30 bg-nv-warning/10'
        : voiceHealth?.level === 'poor'
          ? 'text-nv-danger border-nv-danger/30 bg-nv-danger/10'
          : 'text-nv-text-tertiary border-white/[0.12] bg-white/[0.03]';

    return (
      <div className="flex-1 flex flex-col bg-nv-content min-w-0">
        {/* Voice channel header */}
        <div className="h-12 flex items-center px-4 border-b border-white/[0.05] shrink-0 gap-2">
          <Volume2 size={16} className="text-nv-accent shrink-0" />
          {voiceParticipants.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-nv-accent shadow-[0_0_8px_rgba(52,199,89,0.65)] shrink-0 animate-pulse-soft" />
          )}
          <span className="text-sm font-semibold text-nv-text-primary truncate flex-1">
            {activeChannel?.name}
          </span>
          {onToggleMembers && (
            <button
              onClick={onToggleMembers}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                showMembers
                  ? 'bg-white/10 text-nv-text-primary'
                  : 'text-nv-text-tertiary hover:bg-white/5 hover:text-nv-text-secondary'
              }`}
              title="Toggle member list"
            >
              <UsersRound size={15} />
            </button>
          )}
        </div>

        {/* Stats + controls */}
        <div className="px-5 py-4 border-b border-white/[0.05] bg-nv-surface/10">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-nv-text-secondary flex items-center gap-2">
              <Users size={14} />
              <span>{members.length} members</span>
            </div>
            <div className="text-sm text-nv-text-secondary flex items-center gap-2">
              <Mic size={14} />
              <span>{voiceParticipants.length} in voice</span>
            </div>
            <span className="text-[11px] px-2 py-1 rounded-md border border-nv-accent/30 bg-nv-accent/10 text-nv-accent font-medium">
              {`Opus ${activeQualityLabel} ${activeBitrateKbps} kbps · FEC ${effectiveFecEnabled ? 'On' : 'Off'}`}
            </span>
            <span className={`text-[11px] px-2 py-1 rounded-md border font-medium ${voiceHealthToneClass}`}>
              {`Voice ${voiceHealth?.label || 'Idle'}`}
            </span>
            <div className="ml-auto flex items-center gap-2" ref={voiceControlsRef}>
              {isInThisVoiceChannel && (
                <div className="flex items-center gap-0.5">
                  <div className="relative">
                    <div className="flex items-center rounded-xl overflow-hidden">
                      <button
                        onClick={toggleSelfMute}
                        className={`h-8 inline-flex items-center gap-1.5 px-2.5 text-xs transition-all ${
                          effectiveLocalMuted
                            ? 'text-nv-warning bg-nv-warning/10'
                            : 'text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06]'
                        }`}
                        title={inputMode === 'ptt' ? 'Manual mute (Push To Talk active)' : (selfMuted ? 'Unmute mic' : 'Mute mic')}
                      >
                        {effectiveLocalMuted ? <MicOff size={12} /> : <Mic size={12} />}
                        <span>{micButtonLabel}</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowOutputMenu(false);
                          setShowFxMenu(false);
                          setShowMicMenu((prev) => !prev);
                        }}
                        className={`h-8 w-8 inline-flex items-center justify-center text-xs transition-all ${
                          showMicMenu
                            ? 'text-nv-text-primary bg-white/[0.08]'
                            : 'text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06]'
                        }`}
                        title="Microphone settings"
                      >
                        <ChevronDown size={9} className={`transition-transform ${showMicMenu ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    <AnimatePresence>
                      {showMicMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.98 }}
                          className="absolute right-0 mt-2 w-72 rounded-2xl border border-white/[0.08] bg-nv-channels/95 backdrop-blur-xl shadow-[0_20px_45px_rgba(0,0,0,0.45)] z-40 p-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] text-nv-text-tertiary uppercase tracking-wide">Input</p>
                            <span className="text-[10px] text-nv-text-tertiary">{inputDevices.length} devices</span>
                          </div>

                          <button
                            onClick={() => setShowMicDeviceList((prev) => !prev)}
                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-left hover:bg-white/[0.05] transition-colors"
                          >
                            <p className="text-[10px] text-nv-text-tertiary uppercase tracking-wide mb-1">Input Device</p>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-nv-text-primary truncate flex-1">
                                {compactDeviceLabel(selectedInputDevice?.label || 'System Default Microphone')}
                              </span>
                              <ChevronDown size={12} className={`text-nv-text-tertiary transition-transform ${showMicDeviceList ? 'rotate-180' : ''}`} />
                            </div>
                          </button>

                          <AnimatePresence>
                            {showMicDeviceList && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden mt-2"
                              >
                                <div className="max-h-44 overflow-y-auto rounded-xl border border-white/[0.08] bg-black/20 p-1.5 space-y-1">
                                  {inputDevices.map((device) => {
                                    const selected = device.id === selectedInputDeviceId;
                                    return (
                                      <button
                                        key={device.id}
                                        onClick={() => {
                                          setInputDevice(device.id);
                                          setShowMicDeviceList(false);
                                        }}
                                        className={`w-full text-left rounded-lg px-2 py-1.5 transition-colors ${
                                          selected
                                            ? 'bg-nv-accent/15 border border-nv-accent/40'
                                            : 'border border-transparent hover:bg-white/[0.05]'
                                        }`}
                                        title={device.label}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className={`text-xs truncate flex-1 ${selected ? 'text-nv-accent' : 'text-nv-text-primary'}`}>
                                            {compactDeviceLabel(device.label)}
                                          </span>
                                          {selected && <Check size={12} className="text-nv-accent" />}
                                        </div>
                                        <p className="text-[10px] text-nv-text-tertiary truncate">{deviceSubLabel(device)}</p>
                                      </button>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-[10px] text-nv-text-tertiary uppercase tracking-wide">Input Strength</p>
                              <span className="text-[10px] text-nv-text-secondary">{inputGain}%</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={200}
                              step={1}
                              value={inputGain}
                              onChange={(e) => setInputGain(Number(e.target.value))}
                              className="w-full accent-[#34C759]"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="w-px h-3.5 bg-white/[0.1] mx-0.5" />

                  <div className="relative">
                    <div className="flex items-center rounded-xl overflow-hidden">
                      <button
                        onClick={toggleDeafen}
                        className={`h-8 inline-flex items-center gap-1.5 px-2.5 text-xs transition-all ${
                          deafened
                            ? 'text-nv-warning bg-nv-warning/10'
                            : 'text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06]'
                        }`}
                        title={deafened ? 'Enable audio' : 'Disable audio'}
                      >
                        {deafened ? <VolumeX size={12} /> : <Headphones size={12} />}
                        <span>{deafened ? 'Deafened' : 'Audio'}</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowMicMenu(false);
                          setShowFxMenu(false);
                          setShowOutputMenu((prev) => !prev);
                        }}
                        className={`h-8 w-8 inline-flex items-center justify-center text-xs transition-all ${
                          showOutputMenu
                            ? 'text-nv-text-primary bg-white/[0.08]'
                            : 'text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06]'
                        }`}
                        title="Output settings"
                      >
                        <ChevronDown size={9} className={`transition-transform ${showOutputMenu ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    <AnimatePresence>
                      {showOutputMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.98 }}
                          className="absolute right-0 mt-2 w-72 rounded-2xl border border-white/[0.08] bg-nv-channels/95 backdrop-blur-xl shadow-[0_20px_45px_rgba(0,0,0,0.45)] z-40 p-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] text-nv-text-tertiary uppercase tracking-wide">Output</p>
                            <span className="text-[10px] text-nv-text-tertiary">{outputDevices.length} devices</span>
                          </div>

                          <button
                            onClick={() => setShowOutputDeviceList((prev) => !prev)}
                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-left hover:bg-white/[0.05] transition-colors"
                          >
                            <p className="text-[10px] text-nv-text-tertiary uppercase tracking-wide mb-1">Output Device</p>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-nv-text-primary truncate flex-1">
                                {compactDeviceLabel(selectedOutputDevice?.label || 'System Default Output')}
                              </span>
                              <ChevronDown size={12} className={`text-nv-text-tertiary transition-transform ${showOutputDeviceList ? 'rotate-180' : ''}`} />
                            </div>
                          </button>

                          <AnimatePresence>
                            {showOutputDeviceList && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden mt-2"
                              >
                                <div className="max-h-44 overflow-y-auto rounded-xl border border-white/[0.08] bg-black/20 p-1.5 space-y-1">
                                  {outputDevices.map((device) => {
                                    const selected = device.id === selectedOutputDeviceId;
                                    return (
                                      <button
                                        key={device.id}
                                        onClick={() => {
                                          setOutputDevice(device.id);
                                          setShowOutputDeviceList(false);
                                        }}
                                        className={`w-full text-left rounded-lg px-2 py-1.5 transition-colors ${
                                          selected
                                            ? 'bg-nv-accent/15 border border-nv-accent/40'
                                            : 'border border-transparent hover:bg-white/[0.05]'
                                        }`}
                                        title={device.label}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className={`text-xs truncate flex-1 ${selected ? 'text-nv-accent' : 'text-nv-text-primary'}`}>
                                            {compactDeviceLabel(device.label)}
                                          </span>
                                          {selected && <Check size={12} className="text-nv-accent" />}
                                        </div>
                                        <p className="text-[10px] text-nv-text-tertiary truncate">{deviceSubLabel(device)}</p>
                                      </button>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-[10px] text-nv-text-tertiary uppercase tracking-wide">Master Volume</p>
                              <span className="text-[10px] text-nv-text-secondary">{outputVolume}%</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={200}
                              step={1}
                              value={outputVolume}
                              onChange={(e) => setOutputVolume(Number(e.target.value))}
                              className="w-full accent-[#34C759]"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="w-px h-3.5 bg-white/[0.1] mx-0.5" />

                  <div className="relative">
                    <div className="flex items-center rounded-xl overflow-hidden">
                      <button
                        onClick={() => {
                          setShowMicMenu(false);
                          setShowOutputMenu(false);
                          setShowMicDeviceList(false);
                          setShowOutputDeviceList(false);
                          setShowFxMenu((prev) => !prev);
                        }}
                        className={`h-8 w-8 inline-flex items-center justify-center transition-all ${
                          enabledFxCount > 0
                            ? 'text-nv-accent bg-nv-accent/10'
                            : 'text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06]'
                        }`}
                        title="Audio FX settings"
                      >
                        <SlidersHorizontal size={13} />
                      </button>
                      <button
                        onClick={() => {
                          setShowMicMenu(false);
                          setShowOutputMenu(false);
                          setShowMicDeviceList(false);
                          setShowOutputDeviceList(false);
                          setShowFxMenu((prev) => !prev);
                        }}
                        className={`h-8 w-8 inline-flex items-center justify-center text-xs transition-all ${
                          showFxMenu
                            ? 'text-nv-text-primary bg-white/[0.08]'
                            : 'text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06]'
                        }`}
                        title="Audio FX menu"
                      >
                        <ChevronDown size={9} className={`transition-transform ${showFxMenu ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    <AnimatePresence>
                      {showFxMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.98 }}
                          className="absolute right-0 mt-2 w-72 rounded-2xl border border-white/[0.08] bg-nv-channels/95 backdrop-blur-xl shadow-[0_20px_45px_rgba(0,0,0,0.45)] z-40 p-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] text-nv-text-tertiary uppercase tracking-wide">Audio FX</p>
                            <span className="text-[10px] text-nv-text-tertiary">{enabledFxCount}/4 active</span>
                          </div>

                          <div className="mb-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2">
                            <p className="text-[10px] text-nv-text-tertiary uppercase tracking-wide mb-1.5">Voice Quality</p>
                            <div className="grid grid-cols-3 gap-1">
                              {qualityOptions.map((option) => {
                                const selected = voiceQualityMode === option.key;
                                return (
                                  <button
                                    key={option.key}
                                    onClick={() => setVoiceQualityMode(option.key)}
                                    className={`rounded-lg px-2 py-1.5 border transition-all ${
                                      selected
                                        ? 'border-nv-accent/45 bg-nv-accent/12 text-nv-accent'
                                        : 'border-white/[0.08] bg-white/[0.01] text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.05]'
                                    }`}
                                    title={option.label}
                                  >
                                    <p className="text-[11px] font-medium leading-none">{option.label}</p>
                                    <p className="text-[9px] mt-0.5 opacity-80 leading-none">{option.subLabel}</p>
                                  </button>
                                );
                              })}
                            </div>
                            <div className="mt-2 text-[10px] text-nv-text-tertiary flex items-center justify-between gap-2">
                              <span>{`Target ${activeBitrateKbps} kbps`}</span>
                              <span>{liveBitrateText}</span>
                            </div>
                            <div className="mt-1 text-[10px] text-nv-text-tertiary flex items-center justify-between gap-2">
                              <span>{`Loss ${lossText}`}</span>
                              <span>{`Jitter ${jitterText}`}</span>
                              <span>{`RTT ${rttText}`}</span>
                            </div>
                          </div>

                          <div className="mb-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2">
                            <p className="text-[10px] text-nv-text-tertiary uppercase tracking-wide mb-1.5">Transport</p>

                            <div className="mb-2">
                              <p className="text-[10px] text-nv-text-tertiary uppercase tracking-wide mb-1">Forward Error Correction</p>
                              <div className="grid grid-cols-3 gap-1">
                                {fecOptions.map((option) => {
                                  const selected = fecMode === option.key;
                                  return (
                                    <button
                                      key={option.key}
                                      onClick={() => setFecMode(option.key)}
                                      className={`rounded-lg px-2 py-1.5 border transition-all ${
                                        selected
                                          ? 'border-nv-accent/45 bg-nv-accent/12 text-nv-accent'
                                          : 'border-white/[0.08] bg-white/[0.01] text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.05]'
                                      }`}
                                      title={`FEC ${option.label}`}
                                    >
                                      <p className="text-[11px] font-medium leading-none">{option.label}</p>
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="mt-1 text-[10px] text-nv-text-tertiary">
                                {`Effective: ${effectiveFecEnabled ? 'On' : 'Off'}`}
                              </p>
                            </div>

                            <div className="space-y-1.5">
                              <button
                                onClick={() => setLowLatencyMode(!lowLatencyMode)}
                                className={`w-full text-left rounded-xl border px-2.5 py-2 transition-all ${
                                  lowLatencyMode
                                    ? 'border-nv-accent/35 bg-nv-accent/[0.08]'
                                    : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'
                                }`}
                                title="Low latency voice mode"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className={`text-xs font-medium truncate ${lowLatencyMode ? 'text-nv-accent' : 'text-nv-text-primary'}`}>
                                      Low Latency Stream
                                    </p>
                                    <p className="text-[10px] text-nv-text-tertiary truncate">
                                      Smaller packetization for faster voice delivery
                                    </p>
                                  </div>
                                  <span className={`relative w-9 h-5 rounded-full transition-all ${lowLatencyMode ? 'bg-nv-accent/70' : 'bg-white/[0.12]'}`}>
                                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${lowLatencyMode ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                  </span>
                                </div>
                              </button>

                              <button
                                onClick={() => setPrioritizeVoicePackets(!prioritizeVoicePackets)}
                                className={`w-full text-left rounded-xl border px-2.5 py-2 transition-all ${
                                  prioritizeVoicePackets
                                    ? 'border-nv-accent/35 bg-nv-accent/[0.08]'
                                    : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'
                                }`}
                                title="Prioritize voice packets"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className={`text-xs font-medium truncate ${prioritizeVoicePackets ? 'text-nv-accent' : 'text-nv-text-primary'}`}>
                                      Prioritize Voice Packets
                                    </p>
                                    <p className="text-[10px] text-nv-text-tertiary truncate">
                                      Request high send priority in WebRTC transport
                                    </p>
                                  </div>
                                  <span className={`relative w-9 h-5 rounded-full transition-all ${prioritizeVoicePackets ? 'bg-nv-accent/70' : 'bg-white/[0.12]'}`}>
                                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${prioritizeVoicePackets ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                  </span>
                                </div>
                              </button>
                            </div>
                          </div>

                          <div className="mb-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2">
                            <p className="text-[10px] text-nv-text-tertiary uppercase tracking-wide mb-1.5">Input Control</p>
                            <div className="grid grid-cols-2 gap-1 mb-2">
                              <button
                                onClick={() => setInputMode('voice')}
                                className={`rounded-lg px-2 py-1.5 border transition-all ${
                                  inputMode === 'voice'
                                    ? 'border-nv-accent/45 bg-nv-accent/12 text-nv-accent'
                                    : 'border-white/[0.08] bg-white/[0.01] text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.05]'
                                }`}
                                title="Voice activity mode"
                              >
                                <p className="text-[11px] font-medium leading-none">Voice</p>
                                <p className="text-[9px] mt-0.5 opacity-80 leading-none">Always-on</p>
                              </button>
                              <button
                                onClick={() => setInputMode('ptt')}
                                className={`rounded-lg px-2 py-1.5 border transition-all ${
                                  inputMode === 'ptt'
                                    ? 'border-nv-accent/45 bg-nv-accent/12 text-nv-accent'
                                    : 'border-white/[0.08] bg-white/[0.01] text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.05]'
                                }`}
                                title="Push to talk mode"
                              >
                                <p className="text-[11px] font-medium leading-none">Push To Talk</p>
                                <p className="text-[9px] mt-0.5 opacity-80 leading-none">{pttKey}</p>
                              </button>
                            </div>
                            {inputMode === 'ptt' && (
                              <p className="text-[10px] text-nv-text-tertiary">
                                {pttPressed ? 'PTT active (sending)' : 'Hold Space to speak'}
                              </p>
                            )}

                            <button
                              onClick={() => setMicTestEnabled(!micTestEnabled)}
                              className={`w-full mt-2 text-left rounded-xl border px-2.5 py-2 transition-all ${
                                micTestEnabled
                                  ? 'border-nv-accent/35 bg-nv-accent/[0.08]'
                                  : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'
                              }`}
                              title="Mic test"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className={`text-xs font-medium truncate ${micTestEnabled ? 'text-nv-accent' : 'text-nv-text-primary'}`}>
                                    Mic Test
                                  </p>
                                  <p className="text-[10px] text-nv-text-tertiary truncate">
                                    Live input level monitor
                                  </p>
                                </div>
                                <span className={`relative w-9 h-5 rounded-full transition-all ${micTestEnabled ? 'bg-nv-accent/70' : 'bg-white/[0.12]'}`}>
                                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${micTestEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </span>
                              </div>
                              {micTestEnabled && (
                                <div className="mt-2">
                                  <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-nv-accent transition-[width] duration-100"
                                      style={{ width: `${micTestLevel}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </button>
                          </div>

                          <div className="space-y-1.5">
                            {audioFxOptions.map((option) => {
                              const enabled = Boolean(audioProcessing?.[option.key]);
                              return (
                                <button
                                  key={option.key}
                                  onClick={() => setAudioProcessingOption(option.key, !enabled)}
                                  className={`w-full text-left rounded-xl border px-2.5 py-2 transition-all ${
                                    enabled
                                      ? 'border-nv-accent/35 bg-nv-accent/[0.08]'
                                      : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'
                                  }`}
                                  title={option.label}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className={`text-xs font-medium truncate ${enabled ? 'text-nv-accent' : 'text-nv-text-primary'}`}>
                                        {option.label}
                                      </p>
                                      <p className="text-[10px] text-nv-text-tertiary truncate">
                                        {option.description}
                                      </p>
                                    </div>
                                    <span
                                      className={`relative w-9 h-5 rounded-full transition-all ${
                                        enabled ? 'bg-nv-accent/70' : 'bg-white/[0.12]'
                                      }`}
                                    >
                                      <span
                                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                                          enabled ? 'translate-x-4' : 'translate-x-0.5'
                                        }`}
                                      />
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {!isInThisVoiceChannel ? (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={handleJoinVoice}
                  disabled={joiningVoice}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs text-nv-accent hover:bg-nv-accent/[0.08] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {joiningVoice ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <PhoneCall size={12} />
                  )}
                  {joiningVoice ? 'Joining…' : 'Join Voice'}
                </motion.button>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={handleLeaveVoice}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs text-nv-danger hover:bg-nv-danger/[0.08] transition-all"
                >
                  <PhoneOff size={12} />
                  Leave
                </motion.button>
              )}
            </div>
          </div>

          {voiceError && (
            <p className="text-xs text-nv-danger mt-2">{voiceError}</p>
          )}
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {members.map((member) => {
            const inVoice = participantIds.has(member.id);
            const isOnline = onlineUsers.has(member.id) || member.status === 'online';
            const isMutedForMe = mutedUsers.has(member.id);

            return (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-nv-surface/20 border border-white/[0.04]"
              >
                <UserAvatar user={member} size="sm" showStatus isOnline={isOnline} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-nv-text-primary truncate">
                    {member.display_name}
                  </p>
                  <p className="text-xs text-nv-text-tertiary truncate">@{member.username}</p>
                </div>
                <div
                  className={`text-xs px-2 py-1 rounded-lg border font-medium ${
                    inVoice
                      ? 'text-nv-accent border-nv-accent/40 bg-nv-accent/10'
                      : 'text-nv-text-tertiary border-white/[0.08] bg-white/[0.02]'
                  }`}
                >
                  {inVoice ? 'In Voice' : 'Available'}
                </div>
                {member.id !== user.id && inVoice && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleUserMute(member.id)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        isMutedForMe
                          ? 'bg-nv-warning/15 text-nv-warning border border-nv-warning/40'
                          : 'bg-white/[0.03] text-nv-text-tertiary border border-white/[0.08] hover:text-nv-text-primary hover:bg-white/[0.06]'
                      }`}
                      title={isMutedForMe ? 'Unmute for me' : 'Mute for me'}
                    >
                      {isMutedForMe ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                    <div className="w-28">
                      <div className="flex items-center justify-between text-[10px] text-nv-text-tertiary mb-0.5">
                        <span>Volume</span>
                        <span>{Math.max(0, Math.min(200, Number(userVolumes[member.id]) || 100))}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={200}
                        step={1}
                        value={Math.max(0, Math.min(200, Number(userVolumes[member.id]) || 100))}
                        onChange={(e) => setUserVolume(member.id, Number(e.target.value))}
                        className="w-full accent-[#34C759]"
                        disabled={isMutedForMe}
                        title="Adjust this user's volume"
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}

          {members.length === 0 && (
            <div className="text-sm text-nv-text-tertiary py-4 text-center">
              No members found.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-nv-content min-w-0">
      {/* Channel header */}
      <div className="h-12 flex items-center px-4 border-b border-white/[0.05] shrink-0 gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isDM ? (
            <UserAvatar user={activeView?.data} size="xs" />
          ) : (() => {
            const HIcon = CHANNEL_HEADER_ICONS[activeChannel?.type] || Hash;
            return <HIcon size={16} className="text-nv-text-tertiary shrink-0" />;
          })()}
          <span className="text-sm font-semibold text-nv-text-primary truncate">
            {channelName || 'Select a channel'}
          </span>
        </div>

        {!isDM && onToggleMembers && (
          <button
            onClick={onToggleMembers}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0 ${
              showMembers
                ? 'bg-white/10 text-nv-text-primary'
                : 'text-nv-text-tertiary hover:bg-white/5 hover:text-nv-text-secondary'
            }`}
            title="Toggle member list"
          >
            <UsersRound size={15} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5"
      >
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 rounded-full border-2 border-nv-accent border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && currentMessages.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-12"
          >
            <div className="w-16 h-16 rounded-2xl bg-nv-surface/30 flex items-center justify-center mb-4">
              {isDM ? (
                <UserAvatar user={activeView?.data} size="lg" />
              ) : (
                <Hash size={28} className="text-nv-text-tertiary" />
              )}
            </div>
            <h3 className="text-lg font-semibold text-nv-text-primary mb-1">
              {isDM
                ? `Chat with ${activeView?.data?.display_name}`
                : `Welcome to #${activeChannel?.name}`}
            </h3>
            <p className="text-sm text-nv-text-secondary">
              Send the first message to start the conversation.
            </p>
          </motion.div>
        )}

        {currentMessages.map((msg, i) => {
          const isOwn = msg.sender_id === user.id;
          const grouped = shouldGroup(currentMessages[i - 1], msg);

          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.12 }}
              className={`flex gap-3 px-2 py-0.5 rounded-lg hover:bg-white/[0.025] transition-colors group ${
                grouped ? '' : 'mt-3'
              }`}
            >
              <div className="w-10 shrink-0">
                {!grouped && <UserAvatar user={msg} size="md" />}
              </div>
              <div className="flex-1 min-w-0">
                {!grouped && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span
                      className={`text-sm font-semibold ${
                        isOwn ? 'text-nv-accent' : 'text-nv-text-primary'
                      }`}
                    >
                      {msg.display_name}
                    </span>
                    <span className="text-[10px] text-nv-text-tertiary">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                )}
                <MessageContent content={msg.content} />
              </div>
            </motion.div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      <AnimatePresence>
        {typingUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 24 }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 flex items-center"
          >
            <span className="text-xs text-nv-text-tertiary flex items-center gap-1.5">
              <span className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-nv-text-tertiary animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 rounded-full bg-nv-text-tertiary animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-1 rounded-full bg-nv-text-tertiary animate-bounce [animation-delay:300ms]" />
              </span>
              {typingUsers.map((u) => u.username).join(', ')} is typing...
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Message input — hidden for non-owners in announcements channels */}
      {(!isAnnouncements || isOwner) ? (
        <MessageInput
          onSend={handleSend}
          placeholder={
            isDM
              ? `Message ${activeView?.data?.display_name}`
              : isAnnouncements
              ? `Announce to #${activeChannel?.name || ''}`
              : `Message #${activeChannel?.name || ''}`
          }
          channelId={isDM ? activeView?.id : activeChannel?.id}
          isDM={isDM}
          targetId={isDM ? activeView?.id : null}
        />
      ) : (
        <div className="px-4 py-3 border-t border-white/[0.05] text-center">
          <p className="text-xs text-nv-text-tertiary">
            Only the server owner can post announcements.
          </p>
        </div>
      )}
    </div>
  );
}
