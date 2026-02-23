import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, RefreshCw, Check } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractVersion(message) {
  return message?.match(/v([\d.]+(-[a-z0-9.]+)?)/i)?.[1] || null;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function UpdateOverlay() {
  // phase: 'hidden' | 'downloading' | 'ready'
  const [phase, setPhase] = useState('hidden');
  const [percent, setPercent] = useState(0);
  const [version, setVersion] = useState('');
  const [countdown, setCountdown] = useState(8);

  const countdownTimer = useRef(null);

  const isElectron = Boolean(window.electronAPI?.updater);

  // ── Countdown logic ────────────────────────────────────────────────────────
  const stopCountdown = () => {
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
  };

  const startCountdown = () => {
    setCountdown(8);
    stopCountdown();
    countdownTimer.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          stopCountdown();
          window.electronAPI.updater.restartAndInstall();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ── Status handler ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isElectron) return;

    const handle = (s) => {
      if (!s) return;

      if (s.status === 'downloading') {
        setPhase('downloading');
        setPercent(s.percent ?? 0);
        const v = extractVersion(s.message);
        if (v) setVersion(v);

      } else if (s.status === 'downloaded') {
        stopCountdown();
        const v = extractVersion(s.message);
        if (v) setVersion(v);
        setPercent(100);
        setPhase('ready');
        startCountdown();

      } else {
        // up-to-date, error, disabled, idle → hide
        setPhase('hidden');
        stopCountdown();
      }
    };

    // Catch any status that fired before this component mounted
    window.electronAPI.updater.getStatus().then(handle).catch(() => {});

    // Live updates
    const unsub = window.electronAPI.updater.onStatus(handle);

    return () => {
      unsub?.();
      stopCountdown();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isElectron]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleRestartNow = () => {
    stopCountdown();
    window.electronAPI.updater.restartAndInstall();
  };

  const handleLater = () => {
    stopCountdown();
    setPhase('hidden');
    // autoInstallOnAppQuit is true, so update installs on next quit automatically.
  };

  if (!isElectron) return null;

  return (
    <AnimatePresence>
      {phase !== 'hidden' && (
        <motion.div
          key="update-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black select-none"
        >
          {/* NoVoice wordmark */}
          <div className="flex items-center gap-2 mb-12">
            <div className="w-3 h-3 rounded-full bg-nv-accent shadow-[0_0_10px_rgba(52,199,89,0.7)]" />
            <span className="text-[11px] font-semibold text-white/60 tracking-[0.2em] uppercase">
              NoVoice
            </span>
          </div>

          {/* ── Downloading ─────────────────────────────────────────────── */}
          {phase === 'downloading' && (
            <motion.div
              key="dl"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-6 w-72"
            >
              {/* Icon */}
              <div className="w-14 h-14 rounded-2xl bg-nv-accent/10 border border-nv-accent/25 flex items-center justify-center">
                <motion.div
                  animate={{ y: [0, 4, 0] }}
                  transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                >
                  <Download size={22} className="text-nv-accent" />
                </motion.div>
              </div>

              {/* Text */}
              <div className="text-center space-y-1">
                <p className="text-white text-sm font-medium">Downloading update</p>
                {version ? (
                  <p className="text-white/40 text-xs">Version {version}</p>
                ) : null}
              </div>

              {/* Progress bar */}
              <div className="w-full space-y-1.5">
                <div className="w-full h-[3px] rounded-full bg-white/[0.07] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-nv-accent"
                    animate={{ width: `${percent}%` }}
                    transition={{ ease: 'easeOut', duration: 0.5 }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-white/30">
                  <span>Downloading…</span>
                  <span>{Math.round(percent)}%</span>
                </div>
              </div>

              <p className="text-white/25 text-[11px]">
                The app will restart once the download is complete.
              </p>
            </motion.div>
          )}

          {/* ── Ready (countdown to restart) ────────────────────────────── */}
          {phase === 'ready' && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, scale: 0.95, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center gap-6 w-72"
            >
              {/* Icon */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                className="w-14 h-14 rounded-2xl bg-nv-accent/10 border border-nv-accent/25 flex items-center justify-center"
              >
                <Check size={22} className="text-nv-accent" />
              </motion.div>

              {/* Text */}
              <div className="text-center space-y-1">
                <p className="text-white text-sm font-medium">Update ready</p>
                {version ? (
                  <p className="text-white/40 text-xs">Version {version} is installed</p>
                ) : null}
              </div>

              {/* Countdown progress bar (full → empty in 8s) */}
              <div className="w-full space-y-1.5">
                <div className="w-full h-[3px] rounded-full bg-white/[0.07] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-nv-accent"
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: 8, ease: 'linear' }}
                  />
                </div>
                <p className="text-center text-[10px] text-white/35">
                  Restarting in {countdown}s…
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleLater}
                  className="px-4 py-1.5 rounded-xl text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all"
                >
                  Later
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleRestartNow}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs bg-nv-accent/20 text-nv-accent hover:bg-nv-accent/30 transition-all font-medium"
                >
                  <RefreshCw size={11} />
                  Restart Now
                </motion.button>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
