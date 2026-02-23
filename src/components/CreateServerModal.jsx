import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Cloud, Server, Laptop, ChevronRight,
  ChevronLeft, CheckCircle2, Circle, Wifi, WifiOff,
  Copy, Check, AlertCircle, Terminal, BookOpen,
} from 'lucide-react';
import Modal from './Modal';
import api, { testServerConnection } from '../utils/api';
import { useApp } from '../context/AppContext';
import { useSocket } from '../context/SocketContext';

// ── Server type definitions ───────────────────────────────────────────────────

const SERVER_TYPES = [
  {
    id: 'novoice',
    icon: Cloud,
    label: 'NoVoice Cloud',
    description: 'Hosted on NoVoice infrastructure. Zero setup, always online.',
    badge: 'Recommended',
    badgeColor: 'bg-nv-accent/20 text-nv-accent',
  },
  {
    id: 'own',
    icon: Server,
    label: 'Own Server',
    description: 'Connect your VPS or cloud server. Full control over your data.',
    badge: null,
    badgeColor: '',
  },
  {
    id: 'local',
    icon: Laptop,
    label: 'Self-Host',
    description: 'Run directly from this computer. Perfect for local groups.',
    badge: 'Desktop only',
    badgeColor: 'bg-nv-text-tertiary/15 text-nv-text-tertiary',
  },
];

// Milestone steps for "Own Server" setup guide
const OWN_SERVER_STEPS = [
  {
    id: 'vps',
    title: 'Get a VPS',
    description: 'You need a server with a public IP. Hetzner (from 4€/month) is recommended.',
    details: 'Any provider works: Hetzner, DigitalOcean, Contabo, Vultr\nMinimum: 1 vCPU · 512 MB RAM · Ubuntu 22.04',
  },
  {
    id: 'install',
    title: 'Install NoVoice Server',
    description: 'SSH into your server and run:',
    command: `# Docker (recommended)\ndocker run -d -p 3001:3001 \\\n  -e JWT_SECRET=change-me \\\n  -e CENTRAL_AUTH_URL=http://46.224.71.180:3001 \\\n  -v novoice-data:/app/data \\\n  novoice/server:latest\n\n# Or with Node.js\ngit clone https://github.com/novoice/server\ncd server && npm install && npm start`,
    envNote: 'CENTRAL_AUTH_URL lets users log in with their central NoVoice account — no separate registration needed.',
  },
  {
    id: 'connect',
    title: 'Enter Your Server URL',
    description: 'Enter the IP or domain of your VPS:',
    isInput: true,
  },
  {
    id: 'name',
    title: 'Name Your Server',
    isNameInput: true,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function CreateServerModal({ isOpen, onClose }) {
  const { refreshServers, setActiveView, loadServerDetails } = useApp();
  const { socket } = useSocket();

  const [step, setStep] = useState('type'); // 'type' | 'configure'
  const [serverType, setServerType] = useState(null);
  const [serverName, setServerName] = useState('');

  // Own server state
  const [ownStep, setOwnStep] = useState(0);
  const [ownServerUrl, setOwnServerUrl] = useState('http://');
  const [connectionTest, setConnectionTest] = useState(null); // null | 'testing' | { ok, latencyMs, name }

  // Local (self-host) state
  const [localServerInfo, setLocalServerInfo] = useState(null);
  const [localStarting, setLocalStarting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Starter channels
  const [includeRules, setIncludeRules] = useState(false);

  // Submit state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isElectron = Boolean(window.electronAPI?.isElectron);

  const resetAndClose = () => {
    setStep('type');
    setServerType(null);
    setServerName('');
    setOwnStep(0);
    setOwnServerUrl('http://');
    setConnectionTest(null);
    setLocalServerInfo(null);
    setLocalStarting(false);
    setLocalError('');
    setCopiedUrl(false);
    setIncludeRules(false);
    setError('');
    onClose();
  };

  // ── Local server ──────────────────────────────────────────────────────────

  const startLocalServer = async () => {
    if (!window.electronAPI?.localServer) {
      setLocalError('Local server requires the desktop app.');
      return;
    }
    setLocalStarting(true);
    setLocalError('');
    try {
      const result = await window.electronAPI.localServer.start();
      if (result.success) {
        setLocalServerInfo(result);
      } else {
        setLocalError(result.error || 'Failed to start server');
      }
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setLocalStarting(false);
    }
  };

  const stopLocalServer = async () => {
    await window.electronAPI?.localServer?.stop();
    setLocalServerInfo(null);
    setServerName('');
  };

  const copyUrl = () => {
    if (!localServerInfo?.url) return;
    navigator.clipboard.writeText(localServerInfo.url).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  };

  // ── Own server connection test ────────────────────────────────────────────

  const testConnection = async () => {
    setConnectionTest('testing');
    const result = await testServerConnection(ownServerUrl.trim());
    setConnectionTest(result);
  };

  // ── Final: create server ──────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!serverName.trim()) return;
    setError('');
    setLoading(true);

    try {
      const serverUrl =
        serverType === 'own'
          ? ownServerUrl.trim()
          : serverType === 'local'
          ? localServerInfo?.url
          : null;

      const data = await api.createServer(serverName.trim(), serverType, serverUrl);
      if (includeRules) {
        await api.createChannel(data.server.id, 'rules', 'rules');
      }
      await refreshServers();
      await loadServerDetails(data.server.id);
      setActiveView({ type: 'server', id: data.server.id, data: data.server });
      socket?.emit('server:subscribe', { serverId: data.server.id });
      resetAndClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderTypeStep = () => (
    <div className="space-y-2.5">
      <p className="text-sm text-nv-text-secondary mb-4">
        Choose how your server will be hosted.
      </p>
      {SERVER_TYPES.map((type) => {
        const Icon = type.icon;
        const disabled = type.id === 'local' && !isElectron;
        return (
          <motion.button
            key={type.id}
            whileTap={{ scale: disabled ? 1 : 0.985 }}
            onClick={() => {
              if (disabled) return;
              setServerType(type.id);
              setStep('configure');
            }}
            disabled={disabled}
            className={`w-full text-left p-4 rounded-xl border transition-all duration-150 group
              ${disabled
                ? 'border-nv-border/10 opacity-35 cursor-not-allowed'
                : 'border-nv-border/20 hover:border-nv-accent/40 hover:bg-nv-accent/[0.04] cursor-pointer'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                bg-nv-surface/50 group-hover:bg-nv-accent/10 transition-colors`}>
                <Icon size={17} className="text-nv-text-secondary group-hover:text-nv-accent transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-nv-text-primary">{type.label}</span>
                  {type.badge && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${type.badgeColor}`}>
                      {type.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-nv-text-tertiary">{type.description}</p>
              </div>
              {!disabled && (
                <ChevronRight size={15} className="text-nv-text-tertiary group-hover:text-nv-accent shrink-0 transition-colors" />
              )}
            </div>
          </motion.button>
        );
      })}
    </div>
  );

  const renderNoVoiceConfig = () => (
    <div className="space-y-4">
      <p className="text-sm text-nv-text-secondary">
        Hosted on NoVoice infrastructure at no cost. Invite friends via invite code.
      </p>
      <div className="flex items-center gap-3 p-3 rounded-xl bg-nv-surface/30 border border-nv-border/20">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-nv-accent to-emerald-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
          {serverName.trim() ? serverName.trim()[0].toUpperCase() : 'S'}
        </div>
        <div>
          <p className="text-sm font-medium text-nv-text-primary">{serverName.trim() || 'Your Server'}</p>
          <p className="text-xs text-nv-text-tertiary flex items-center gap-1">
            <Cloud size={10} /> NoVoice Cloud · 1 member
          </p>
        </div>
      </div>
      <input
        type="text"
        placeholder="Server name"
        value={serverName}
        onChange={(e) => { setServerName(e.target.value); setError(''); }}
        className="nv-input"
        autoFocus
        maxLength={32}
      />
    </div>
  );

  const renderOwnServerConfig = () => (
    <div className="space-y-3 max-h-[440px] overflow-y-auto pr-0.5">
      {OWN_SERVER_STEPS.map((s, idx) => {
        const done = idx < ownStep;
        const current = idx === ownStep;
        const future = idx > ownStep;

        return (
          <div
            key={s.id}
            className={`rounded-xl border p-3.5 transition-all duration-200
              ${current ? 'border-nv-accent/35 bg-nv-accent/[0.04]' : 'border-nv-border/15'}
              ${future ? 'opacity-35' : ''}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                {done
                  ? <CheckCircle2 size={15} className="text-nv-accent" />
                  : <Circle size={15} className={current ? 'text-nv-accent' : 'text-nv-text-tertiary'} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-nv-text-primary mb-1">
                  {idx + 1}. {s.title}
                </p>
                {current && (
                  <>
                    {s.description && (
                      <p className="text-xs text-nv-text-secondary mb-2">{s.description}</p>
                    )}
                    {s.details && (
                      <pre className="text-[11px] text-nv-text-tertiary bg-black/30 rounded-lg p-2 font-mono whitespace-pre-wrap mb-2">
                        {s.details}
                      </pre>
                    )}
                    {s.command && (
                      <div className="space-y-1.5 mb-2">
                        <div className="bg-black/40 rounded-lg p-2.5 font-mono text-[11px] text-nv-text-secondary overflow-x-auto">
                          <pre className="whitespace-pre">{s.command}</pre>
                        </div>
                        {s.envNote && (
                          <div className="flex items-start gap-1.5 text-[11px] text-nv-text-tertiary">
                            <AlertCircle size={11} className="mt-0.5 shrink-0 text-nv-accent" />
                            <span>{s.envNote}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {s.isInput && (
                      <div className="space-y-2 mb-2">
                        <input
                          type="url"
                          placeholder="http://1.2.3.4:3001"
                          value={ownServerUrl}
                          onChange={(e) => { setOwnServerUrl(e.target.value); setConnectionTest(null); }}
                          className="nv-input text-xs"
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          onClick={testConnection}
                          disabled={connectionTest === 'testing' || !ownServerUrl.startsWith('http')}
                          className="flex items-center gap-1.5 text-xs font-medium text-nv-accent
                            disabled:opacity-40 hover:underline"
                        >
                          {connectionTest === 'testing'
                            ? <><Loader2 size={12} className="animate-spin" /> Testing…</>
                            : <><Wifi size={12} /> Test Connection</>}
                        </button>
                        {connectionTest && connectionTest !== 'testing' && (
                          <div className={`flex items-center gap-1.5 text-xs
                            ${connectionTest.ok ? 'text-nv-accent' : 'text-nv-danger'}`}>
                            {connectionTest.ok ? <Wifi size={12} /> : <WifiOff size={12} />}
                            {connectionTest.ok
                              ? `Connected · ${connectionTest.latencyMs}ms · ${connectionTest.name}`
                              : 'Failed. Check the URL and make sure port 3001 is open.'}
                          </div>
                        )}
                      </div>
                    )}
                    {s.isNameInput && (
                      <input
                        type="text"
                        placeholder="Server name"
                        value={serverName}
                        onChange={(e) => { setServerName(e.target.value); setError(''); }}
                        className="nv-input text-xs mb-2"
                        autoFocus
                        maxLength={32}
                      />
                    )}
                    <div className="flex gap-2 mt-1">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => setOwnStep((p) => p - 1)}
                          className="nv-button-ghost text-xs flex items-center gap-1"
                        >
                          <ChevronLeft size={12} /> Back
                        </button>
                      )}
                      {idx < OWN_SERVER_STEPS.length - 1 && (
                        <button
                          type="button"
                          onClick={() => setOwnStep((p) => p + 1)}
                          disabled={s.isInput && !connectionTest?.ok}
                          className="nv-button-primary text-xs flex items-center gap-1
                            disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Next <ChevronRight size={12} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderLocalConfig = () => (
    <div className="space-y-4">
      {!localServerInfo ? (
        <>
          <p className="text-sm text-nv-text-secondary">
            NoVoice starts a server on this computer. Others on your network can connect
            directly using your local IP address.
          </p>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400/90 leading-relaxed">
              Your local IP will be shared with anyone you send the invite to. For internet
              access beyond your LAN, forward the chosen port on your router.
            </p>
          </div>
          {localError && <p className="text-xs text-nv-danger">{localError}</p>}
          <button
            type="button"
            onClick={startLocalServer}
            disabled={localStarting}
            className="nv-button-primary w-full flex items-center justify-center gap-2"
          >
            {localStarting
              ? <><Loader2 size={15} className="animate-spin" /> Starting…</>
              : <><Terminal size={15} /> Start Local Server</>}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-nv-accent/10 border border-nv-accent/25">
            <CheckCircle2 size={16} className="text-nv-accent shrink-0" />
            <div>
              <p className="text-sm font-medium text-nv-accent">Server running</p>
              <p className="text-xs text-nv-text-secondary font-mono">{localServerInfo.url}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-nv-text-tertiary mb-1.5">
              Friends must be on the same network to connect. Share the invite code after creating:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-black/30 rounded-lg px-3 py-2 text-nv-text-secondary font-mono truncate border border-nv-border/10">
                {localServerInfo.url}
              </code>
              <button
                type="button"
                onClick={copyUrl}
                title="Copy URL"
                className="p-2 rounded-lg hover:bg-nv-surface/50 transition-colors"
              >
                {copiedUrl
                  ? <Check size={14} className="text-nv-accent" />
                  : <Copy size={14} className="text-nv-text-tertiary" />}
              </button>
            </div>
          </div>
          <input
            type="text"
            placeholder="Server name"
            value={serverName}
            onChange={(e) => { setServerName(e.target.value); setError(''); }}
            className="nv-input"
            autoFocus
            maxLength={32}
          />
          <button
            type="button"
            onClick={stopLocalServer}
            className="text-xs text-nv-danger hover:underline"
          >
            Stop server
          </button>
        </>
      )}
    </div>
  );

  // ── Can create? ───────────────────────────────────────────────────────────

  const canCreate = (() => {
    const hasName = serverName.trim().length >= 2;
    if (serverType === 'novoice') return hasName;
    if (serverType === 'own') return ownStep >= OWN_SERVER_STEPS.length - 1 && hasName && connectionTest?.ok;
    if (serverType === 'local') return Boolean(localServerInfo) && hasName;
    return false;
  })();

  const showFooterCreate = step === 'configure' && serverType !== 'own';
  const showOwnCreate = serverType === 'own' && ownStep >= OWN_SERVER_STEPS.length - 1;

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      title={step === 'type' ? 'Create Server' : SERVER_TYPES.find((t) => t.id === serverType)?.label || 'Create Server'}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step === 'type' ? 'type' : serverType}
          initial={{ opacity: 0, x: step === 'type' ? -6 : 6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          {step === 'type' && renderTypeStep()}
          {step === 'configure' && serverType === 'novoice' && renderNoVoiceConfig()}
          {step === 'configure' && serverType === 'own' && renderOwnServerConfig()}
          {step === 'configure' && serverType === 'local' && renderLocalConfig()}
        </motion.div>
      </AnimatePresence>

      {/* Starter channels — visible on configure step for all server types */}
      <AnimatePresence>
        {step === 'configure' && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]"
          >
            <p className="text-[11px] text-nv-text-tertiary uppercase tracking-wider mb-2.5 font-medium">Starter Channels</p>
            <button
              type="button"
              onClick={() => setIncludeRules((p) => !p)}
              className="w-full flex items-center gap-3 group"
            >
              <div className={`w-4 h-4 rounded-[5px] border-2 flex items-center justify-center shrink-0 transition-all
                ${includeRules ? 'bg-nv-accent border-nv-accent' : 'border-white/20 bg-white/[0.03]'}`}>
                {includeRules && <Check size={9} className="text-white" />}
              </div>
              <div className="flex items-center gap-2 flex-1 text-left">
                <BookOpen size={13} className={`shrink-0 transition-colors ${includeRules ? 'text-nv-accent' : 'text-nv-text-tertiary'}`} />
                <div>
                  <span className="text-sm text-nv-text-primary group-hover:text-white transition-colors">Rules channel</span>
                  <span className="block text-[11px] text-nv-text-tertiary">A dedicated channel for server rules &amp; info</span>
                </div>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-nv-danger text-xs font-medium mt-3"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="flex items-center justify-between mt-5 pt-3 border-t border-nv-border/10">
        <button
          type="button"
          onClick={step === 'type' ? resetAndClose : () => { setStep('type'); setOwnStep(0); }}
          className="nv-button-ghost flex items-center gap-1"
        >
          {step === 'type' ? 'Cancel' : <><ChevronLeft size={13} /> Back</>}
        </button>

        {(showFooterCreate || showOwnCreate) && (
          <motion.button
            type="button"
            onClick={handleCreate}
            disabled={loading || !canCreate}
            whileTap={{ scale: 0.97 }}
            className="nv-button-primary disabled:opacity-40 flex items-center gap-2"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : 'Create Server'}
          </motion.button>
        )}
      </div>
    </Modal>
  );
}
