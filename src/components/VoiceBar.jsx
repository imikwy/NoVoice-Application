import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, X, Mic, MicOff, Wifi } from 'lucide-react';
import { useVoice } from '../context/VoiceContext';
import { useApp } from '../context/AppContext';
import { useSocket } from '../context/SocketContext';
import { getServerUrl } from '../utils/api';

export default function VoiceBar({ collapsed }) {
  const {
    voiceConnected,
    activeVoiceChannelId,
    leaveVoice,
    selfMuted,
    toggleSelfMute,
  } = useVoice();
  const { serverDetails } = useApp();
  const { socket } = useSocket();
  const [leaveHovered, setLeaveHovered] = useState(false);
  const [pingMs, setPingMs] = useState(null);
  const [showNetworkInfo, setShowNetworkInfo] = useState(false);

  // Find channel name from cached server details
  let channelName = 'Voice';
  let serverName = 'NoVoice';
  let serverUrl = getServerUrl();
  for (const details of Object.values(serverDetails)) {
    const ch = details?.channels?.find((c) => c.id === activeVoiceChannelId);
    if (ch) {
      channelName = ch.name;
      serverName = details?.server?.name || serverName;
      serverUrl = details?.server?.server_url || serverUrl;
      break;
    }
  }

  const serverLabel = useMemo(() => {
    const safeServerName = typeof serverName === 'string' && serverName.trim() ? serverName : 'NoVoice';
    const safeServerUrl = typeof serverUrl === 'string' ? serverUrl : '';
    if (!safeServerUrl) return safeServerName;
    return `${safeServerName} (${safeServerUrl.replace(/^https?:\/\//, '')})`;
  }, [serverName, serverUrl]);

  useEffect(() => {
    if (!voiceConnected) return;

    const normalizedServerUrl = (typeof serverUrl === 'string' && serverUrl.trim())
      ? serverUrl.replace(/\/$/, '')
      : getServerUrl();

    let disposed = false;

    const measurePing = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const startedAt = performance.now();

      try {
        await fetch(`${normalizedServerUrl}/api/health`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (disposed) return;
        const elapsedMs = performance.now() - startedAt;
        setPingMs(Math.max(1, Math.round(elapsedMs)));
      } catch {
        if (disposed) return;
        setPingMs(null);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    measurePing();
    const id = setInterval(measurePing, 5000);
    return () => {
      disposed = true;
      clearInterval(id);
    };
  }, [voiceConnected, serverUrl, socket]);

  if (!voiceConnected || !activeVoiceChannelId) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="mx-2 mb-2 px-2.5 py-2 rounded-xl bg-nv-accent/[0.08] border border-nv-accent/20"
      >
        <div className="flex items-center gap-2">
          {/* Live indicator + channel name */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="w-2 h-2 rounded-full bg-nv-accent shrink-0 animate-pulse-soft shadow-[0_0_6px_rgba(52,199,89,0.8)]" />
            {!collapsed && (
              <>
                <Volume2 size={11} className="text-nv-accent shrink-0" />
                <span className="text-xs text-nv-accent truncate font-medium">
                  {channelName}
                </span>
              </>
            )}
          </div>

          {/* Controls */}
          {!collapsed && (
            <div className="flex items-center gap-0.5">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={toggleSelfMute}
                className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${
                  selfMuted
                    ? 'bg-nv-warning/20 text-nv-warning'
                    : 'text-nv-accent/60 hover:text-nv-accent hover:bg-nv-accent/15'
                }`}
                title={selfMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {selfMuted ? <MicOff size={11} /> : <Mic size={11} />}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => leaveVoice(true)}
                onMouseEnter={() => setLeaveHovered(true)}
                onMouseLeave={() => setLeaveHovered(false)}
                className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${
                  leaveHovered
                    ? 'bg-nv-danger/20 text-nv-danger'
                    : 'text-nv-text-tertiary hover:text-nv-danger hover:bg-nv-danger/10'
                }`}
                title="Leave voice channel"
              >
                <X size={11} />
              </motion.button>
            </div>
          )}
        </div>

        {/* Connected label */}
        {!collapsed && (
          <div
            className="mt-1 inline-flex relative"
            onMouseEnter={() => setShowNetworkInfo(true)}
            onMouseLeave={() => setShowNetworkInfo(false)}
          >
            <p className="text-[10px] text-nv-accent/60 font-medium flex items-center gap-1">
              Connected
              <Wifi size={10} className="text-nv-accent/70" />
            </p>

            <AnimatePresence>
              {showNetworkInfo && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute left-0 bottom-full mb-1 w-52 z-[80] rounded-lg bg-nv-surface border border-white/[0.08] shadow-xl px-2.5 py-2"
                >
                  <p className="text-[10px] text-nv-text-tertiary uppercase tracking-wide mb-1">Voice Network</p>
                  <div className="text-[11px] text-nv-text-secondary flex items-center justify-between gap-2">
                    <span>Ping</span>
                    <span className="text-nv-text-primary font-medium">{pingMs !== null ? `${pingMs} ms` : '...'}</span>
                  </div>
                  <div className="text-[11px] text-nv-text-secondary mt-1">
                    <span className="text-nv-text-tertiary mr-1">Server</span>
                    <span className="text-nv-text-primary break-all">{serverLabel}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
