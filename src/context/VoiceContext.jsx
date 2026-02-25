import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { useApp } from './AppContext';

const VoiceContext = createContext(null);
const VOICE_SETTINGS_KEY = 'nv_voice_settings';

const DEFAULT_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

function normalizeIceServerList(value) {
  if (!Array.isArray(value)) {
    return DEFAULT_ICE_SERVERS;
  }

  const normalized = value
    .map((entry) => {
      if (!entry) return null;
      const urls = Array.isArray(entry.urls) ? entry.urls.filter(Boolean) : [entry.urls].filter(Boolean);
      if (urls.length === 0) return null;

      const next = { urls };
      if (entry.username) next.username = String(entry.username);
      if (entry.credential) next.credential = String(entry.credential);
      return next;
    })
    .filter(Boolean);

  return normalized.length > 0 ? normalized : DEFAULT_ICE_SERVERS;
}

const DEFAULT_AUDIO_PROCESSING_SETTINGS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  highpassFilter: true,
};

const VOICE_QUALITY_PROFILES = {
  auto: {
    id: 'auto',
    minBitrate: 96000,
    maxBitrate: 320000,
    initialBitrate: 192000,
    targetBitrate: null,
    adaptive: true,
  },
  high: {
    id: 'high',
    minBitrate: 160000,
    maxBitrate: 384000,
    initialBitrate: 256000,
    targetBitrate: 256000,
    adaptive: false,
  },
  extreme: {
    id: 'extreme',
    minBitrate: 256000,
    maxBitrate: 510000,
    initialBitrate: 510000,
    targetBitrate: 510000,
    adaptive: false,
  },
};

const FEC_MODES = {
  auto: 'auto',
  on: 'on',
  off: 'off',
};

const INPUT_MODES = {
  voice: 'voice',
  ptt: 'ptt',
};

const BASE_AUDIO_CONSTRAINTS = {
  channelCount: 2,
  sampleRate: 48000,
  sampleSize: 24,
  latency: 0,
};
const MAX_MUSIC_SEEK_SECONDS = 12 * 60 * 60;

function clampMusicSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return clamp(Math.round(numeric * 1000) / 1000, 0, MAX_MUSIC_SEEK_SECONDS);
}

function normalizeMusicTrack(track) {
  if (!track || typeof track !== 'object') return null;
  const url = String(track.url || '').trim();
  if (!url) return null;

  const resolvedStreamUrl = track.stream_url ? String(track.stream_url) : (track.streamUrl ? String(track.streamUrl) : null);
  const resolvedSource = String(track.source || 'direct').toLowerCase();
  const resolvedVideoId = String(track.video_id || track.videoId || '').trim();
  const resolvedPlayerType = String(track.player_type || track.playerType || (resolvedVideoId ? 'youtube' : 'audio')).toLowerCase();
  const resolvedIsPlayable = track.is_playable !== undefined
    ? Boolean(track.is_playable)
    : (track.isPlayable !== undefined
      ? Boolean(track.isPlayable)
      : Boolean(resolvedStreamUrl || resolvedSource === 'direct' || (resolvedPlayerType === 'youtube' && resolvedVideoId)));

  return {
    id: String(track.id || ''),
    url,
    title: String(track.title || 'Untitled Track').trim() || 'Untitled Track',
    source: resolvedSource,
    sourceLabel: String(track.source_label || track.sourceLabel || 'Audio Link'),
    coverUrl: track.cover_url ? String(track.cover_url) : (track.coverUrl ? String(track.coverUrl) : null),
    streamUrl: resolvedStreamUrl,
    playerType: resolvedPlayerType,
    videoId: resolvedVideoId,
    isPlayable: resolvedIsPlayable,
    playbackHint: String(track.playback_hint || track.playbackHint || ''),
    durationSec: Number.isFinite(Number(track.duration_sec))
      ? clampMusicSeconds(track.duration_sec)
      : (Number.isFinite(Number(track.durationSec)) ? clampMusicSeconds(track.durationSec) : null),
    requestedByUserId: String(track.requested_by_user_id || track.requestedByUserId || ''),
    requestedByName: String(track.requested_by_name || track.requestedByName || '').trim() || 'Member',
    addedAtMs: Number.isFinite(Number(track.added_at_ms)) ? Number(track.added_at_ms) : Date.now(),
  };
}

function createEmptyVoiceMusicState(channelId = null) {
  const nowMs = Date.now();
  return {
    channelId: channelId || null,
    queue: [],
    currentIndex: -1,
    currentTrackId: null,
    currentTrack: null,
    playbackState: 'idle',
    positionSec: 0,
    serverNowMs: nowMs,
    updatedAtMs: nowMs,
    updatedByUserId: null,
  };
}

function normalizeVoiceMusicState(payload, fallbackChannelId = null) {
  if (!payload || typeof payload !== 'object') {
    return createEmptyVoiceMusicState(fallbackChannelId);
  }

  const channelId = payload.channelId ? String(payload.channelId) : (fallbackChannelId || null);
  const queue = Array.isArray(payload.queue)
    ? payload.queue.map((track) => normalizeMusicTrack(track)).filter(Boolean)
    : [];
  const requestedState = String(payload.playbackState || 'idle').toLowerCase();
  const playbackState = ['playing', 'paused', 'idle'].includes(requestedState) ? requestedState : 'idle';
  const currentIndexRaw = Number(payload.currentIndex);
  const currentIndex = Number.isInteger(currentIndexRaw)
    ? clamp(currentIndexRaw, -1, queue.length - 1)
    : -1;
  const currentTrack = currentIndex >= 0 ? (queue[currentIndex] || null) : null;
  const currentTrackId = currentTrack?.id || (payload.currentTrackId ? String(payload.currentTrackId) : null);
  const serverNowMs = Number.isFinite(Number(payload.serverNowMs)) ? Number(payload.serverNowMs) : Date.now();

  return {
    channelId,
    queue,
    currentIndex,
    currentTrackId,
    currentTrack,
    playbackState: currentTrack ? playbackState : 'idle',
    positionSec: clampMusicSeconds(payload.positionSec),
    serverNowMs,
    updatedAtMs: Number.isFinite(Number(payload.updatedAtMs)) ? Number(payload.updatedAtMs) : serverNowMs,
    updatedByUserId: payload.updatedByUserId ? String(payload.updatedByUserId) : null,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAudioProcessingSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    echoCancellation: source.echoCancellation !== undefined ? Boolean(source.echoCancellation) : DEFAULT_AUDIO_PROCESSING_SETTINGS.echoCancellation,
    noiseSuppression: source.noiseSuppression !== undefined ? Boolean(source.noiseSuppression) : DEFAULT_AUDIO_PROCESSING_SETTINGS.noiseSuppression,
    autoGainControl: source.autoGainControl !== undefined ? Boolean(source.autoGainControl) : DEFAULT_AUDIO_PROCESSING_SETTINGS.autoGainControl,
    highpassFilter: source.highpassFilter !== undefined ? Boolean(source.highpassFilter) : DEFAULT_AUDIO_PROCESSING_SETTINGS.highpassFilter,
  };
}

function normalizeVoiceQualityMode(value) {
  const key = String(value || 'auto').toLowerCase();
  return VOICE_QUALITY_PROFILES[key] ? key : 'auto';
}

function normalizeFecMode(value) {
  const key = String(value || FEC_MODES.auto).toLowerCase();
  return FEC_MODES[key] || FEC_MODES.auto;
}

function normalizeInputMode(value) {
  const key = String(value || INPUT_MODES.voice).toLowerCase();
  return INPUT_MODES[key] || INPUT_MODES.voice;
}

function evaluateVoiceHealth(stats, hasRemotePeers, isConnected) {
  if (!isConnected) {
    return { level: 'idle', label: 'Disconnected' };
  }
  if (!hasRemotePeers) {
    return { level: 'idle', label: 'Ready' };
  }

  const loss = Number(stats?.packetLossPercent);
  const jitter = Number(stats?.jitterMs);
  const rtt = Number(stats?.rttMs);

  if (
    (Number.isFinite(loss) && loss >= 8)
    || (Number.isFinite(jitter) && jitter >= 28)
    || (Number.isFinite(rtt) && rtt >= 260)
  ) {
    return { level: 'poor', label: 'Poor' };
  }

  if (
    (Number.isFinite(loss) && loss >= 3)
    || (Number.isFinite(jitter) && jitter >= 16)
    || (Number.isFinite(rtt) && rtt >= 170)
  ) {
    return { level: 'fair', label: 'Fair' };
  }

  if (
    Number.isFinite(loss)
    || Number.isFinite(jitter)
    || Number.isFinite(rtt)
  ) {
    return { level: 'good', label: 'Good' };
  }

  return { level: 'idle', label: 'Analyzing' };
}

function getVoiceQualityProfile(mode) {
  return VOICE_QUALITY_PROFILES[normalizeVoiceQualityMode(mode)];
}

function clampBitrateForMode(value, mode) {
  const profile = getVoiceQualityProfile(mode);
  const fallback = profile.adaptive ? profile.initialBitrate : profile.targetBitrate;
  return clamp(Math.round(Number(value) || fallback), profile.minBitrate, profile.maxBitrate);
}

function getInitialBitrateForMode(mode) {
  const profile = getVoiceQualityProfile(mode);
  return profile.adaptive ? profile.initialBitrate : profile.targetBitrate;
}

function buildAudioConstraint(deviceId, audioProcessing) {
  const constraint = {
    ...BASE_AUDIO_CONSTRAINTS,
    ...normalizeAudioProcessingSettings(audioProcessing),
  };

  if (deviceId && deviceId !== 'default') {
    constraint.deviceId = { exact: deviceId };
  }

  return constraint;
}

function buildTrackConstraint(audioProcessing) {
  const processing = normalizeAudioProcessingSettings(audioProcessing);
  return {
    ...BASE_AUDIO_CONSTRAINTS,
    ...processing,
  };
}

function loadVoiceSettings() {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_KEY);
    if (!raw) {
      return {
        selectedInputDeviceId: 'default',
        selectedOutputDeviceId: 'default',
        inputGain: 100,
        outputVolume: 100,
        userVolumes: {},
        audioProcessing: { ...DEFAULT_AUDIO_PROCESSING_SETTINGS },
        voiceQualityMode: 'auto',
        fecMode: FEC_MODES.auto,
        lowLatencyMode: true,
        prioritizeVoicePackets: true,
        inputMode: INPUT_MODES.voice,
        pttKey: 'Space',
        micTestEnabled: false,
      };
    }

    const parsed = JSON.parse(raw);
    return {
      selectedInputDeviceId: parsed.selectedInputDeviceId || 'default',
      selectedOutputDeviceId: parsed.selectedOutputDeviceId || 'default',
      inputGain: clamp(Number(parsed.inputGain) || 100, 0, 200),
      outputVolume: clamp(Number(parsed.outputVolume) || 100, 0, 200),
      userVolumes: parsed.userVolumes && typeof parsed.userVolumes === 'object' ? parsed.userVolumes : {},
      audioProcessing: normalizeAudioProcessingSettings(parsed.audioProcessing),
      voiceQualityMode: normalizeVoiceQualityMode(parsed.voiceQualityMode),
      fecMode: normalizeFecMode(parsed.fecMode),
      lowLatencyMode: parsed.lowLatencyMode !== undefined ? Boolean(parsed.lowLatencyMode) : true,
      prioritizeVoicePackets: parsed.prioritizeVoicePackets !== undefined ? Boolean(parsed.prioritizeVoicePackets) : true,
      inputMode: normalizeInputMode(parsed.inputMode),
      pttKey: String(parsed.pttKey || 'Space'),
      micTestEnabled: Boolean(parsed.micTestEnabled),
    };
  } catch {
    return {
      selectedInputDeviceId: 'default',
      selectedOutputDeviceId: 'default',
      inputGain: 100,
      outputVolume: 100,
      userVolumes: {},
      audioProcessing: { ...DEFAULT_AUDIO_PROCESSING_SETTINGS },
      voiceQualityMode: 'auto',
      fecMode: FEC_MODES.auto,
      lowLatencyMode: true,
      prioritizeVoicePackets: true,
      inputMode: INPUT_MODES.voice,
      pttKey: 'Space',
      micTestEnabled: false,
    };
  }
}

function tuneOpusSdp(
  sdp,
  {
    maxAverageBitrate = 320000,
    fecEnabled = true,
    lowLatencyMode = true,
  } = {}
) {
  if (!sdp || typeof sdp !== 'string') return sdp;

  const opusPayloadMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000\/2/i);
  if (!opusPayloadMatch) return sdp;

  const payloadType = opusPayloadMatch[1];
  const fmtpRegex = new RegExp(`a=fmtp:${payloadType}\\s([^\\r\\n]*)`, 'i');
  const fmtpMatch = sdp.match(fmtpRegex);

  const requiredParams = [
    'stereo=1',
    'sprop-stereo=1',
    `maxaveragebitrate=${clamp(Math.round(Number(maxAverageBitrate) || 320000), 64000, 510000)}`,
    'maxplaybackrate=48000',
    lowLatencyMode ? 'minptime=10' : 'minptime=20',
    lowLatencyMode ? 'ptime=10' : 'ptime=20',
    lowLatencyMode ? 'maxptime=20' : 'maxptime=60',
    'cbr=0',
    'usedtx=0',
    `useinbandfec=${fecEnabled ? 1 : 0}`,
  ];

  if (fmtpMatch) {
    const existing = fmtpMatch[1];
    const merged = new Set(existing.split(';').map((p) => p.trim()).filter(Boolean));
    requiredParams.forEach((param) => merged.add(param));
    return sdp.replace(fmtpRegex, `a=fmtp:${payloadType} ${[...merged].join(';')}`);
  }

  const insertionPoint = `a=rtpmap:${payloadType} opus/48000/2`;
  const fmtpLine = `a=fmtp:${payloadType} ${requiredParams.join(';')}`;
  return sdp.replace(insertionPoint, `${insertionPoint}\r\n${fmtpLine}`);
}

async function optimizeAudioSender(
  sender,
  {
    maxBitrate = 192000,
    lowLatencyMode = true,
    prioritizeVoicePackets = true,
  } = {}
) {
  if (!sender || sender.track?.kind !== 'audio' || !sender.getParameters || !sender.setParameters) {
    return;
  }

  const nextBitrate = clamp(Math.round(Number(maxBitrate) || 192000), 64000, 510000);
  const packetizationMs = lowLatencyMode ? 10 : 20;

  const applyParams = async (allowPriorityFields) => {
    const params = sender.getParameters() || {};
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings = params.encodings.map((enc) => ({
      ...enc,
      maxBitrate: nextBitrate,
      ptime: packetizationMs,
      dtx: false,
      ...(allowPriorityFields ? { priority: 'high', networkPriority: 'high' } : {}),
    }));
    await sender.setParameters(params);
  };

  try {
    await applyParams(prioritizeVoicePackets);
  } catch {
    if (!prioritizeVoicePackets) return;
    try {
      await applyParams(false);
    } catch {
      // Browser may reject advanced sender params
    }
  }
}

function RemoteAudio({ stream, muted, gain, outputDeviceId }) {
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !stream) return;

    audio.srcObject = stream;
    audio.muted = muted;
    audio.volume = clamp(gain, 0, 1);

    if (typeof audio.setSinkId === 'function' && outputDeviceId) {
      audio.setSinkId(outputDeviceId).catch(() => {});
    }

    audio.play().catch(() => {});
  }, [stream, muted, gain, outputDeviceId]);

  return <audio ref={audioRef} autoPlay playsInline />;
}

export function VoiceProvider({ children }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  let appContext = null;
  try {
    appContext = useApp();
  } catch {
    appContext = null;
  }
  const activeView = appContext?.activeView ?? null;
  const activeChannel = appContext?.activeChannel ?? null;
  const activeServerApi = appContext?.activeServerApi ?? null;
  const initialSettingsRef = useRef(loadVoiceSettings());

  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState(null);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [joiningVoice, setJoiningVoice] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [voiceParticipants, setVoiceParticipants] = useState([]);
  const [selfMuted, setSelfMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [mutedUsers, setMutedUsers] = useState(new Set());
  const [remoteAudioStreams, setRemoteAudioStreams] = useState([]);

  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState(initialSettingsRef.current.selectedInputDeviceId);
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState(initialSettingsRef.current.selectedOutputDeviceId);
  const [inputGain, setInputGainState] = useState(initialSettingsRef.current.inputGain);
  const [outputVolume, setOutputVolumeState] = useState(initialSettingsRef.current.outputVolume);
  const [userVolumes, setUserVolumes] = useState(initialSettingsRef.current.userVolumes);
  const [audioProcessing, setAudioProcessing] = useState(initialSettingsRef.current.audioProcessing);
  const [voiceQualityMode, setVoiceQualityModeState] = useState(
    normalizeVoiceQualityMode(initialSettingsRef.current.voiceQualityMode)
  );
  const [fecMode, setFecModeState] = useState(normalizeFecMode(initialSettingsRef.current.fecMode));
  const [lowLatencyMode, setLowLatencyModeState] = useState(
    initialSettingsRef.current.lowLatencyMode !== undefined
      ? Boolean(initialSettingsRef.current.lowLatencyMode)
      : true
  );
  const [prioritizeVoicePackets, setPrioritizeVoicePacketsState] = useState(
    initialSettingsRef.current.prioritizeVoicePackets !== undefined
      ? Boolean(initialSettingsRef.current.prioritizeVoicePackets)
      : true
  );
  const [inputMode, setInputModeState] = useState(normalizeInputMode(initialSettingsRef.current.inputMode));
  const [pttKey, setPttKeyState] = useState(String(initialSettingsRef.current.pttKey || 'Space'));
  const [pttPressed, setPttPressed] = useState(false);
  const [micTestEnabled, setMicTestEnabledState] = useState(Boolean(initialSettingsRef.current.micTestEnabled));
  const [micTestLevel, setMicTestLevel] = useState(0);
  const [effectiveFecEnabled, setEffectiveFecEnabled] = useState(fecMode !== FEC_MODES.off);
  const [targetAudioBitrate, setTargetAudioBitrate] = useState(() =>
    getInitialBitrateForMode(normalizeVoiceQualityMode(initialSettingsRef.current.voiceQualityMode))
  );
  const [voiceNetworkStats, setVoiceNetworkStats] = useState({
    packetLossPercent: null,
    jitterMs: null,
    rttMs: null,
    measuredBitrateKbps: null,
  });
  const [iceConfiguration, setIceConfiguration] = useState(() => ({ iceServers: DEFAULT_ICE_SERVERS }));
  const [voiceMusicState, setVoiceMusicState] = useState(() => createEmptyVoiceMusicState(null));
  const [voiceMusicError, setVoiceMusicError] = useState('');
  const [voiceMusicPositionSec, setVoiceMusicPositionSec] = useState(0);

  const microphoneStreamRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const joinedVoiceChannelRef = useRef(null);
  const socketRef = useRef(socket);
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const destinationNodeRef = useRef(null);
  const senderStatsCacheRef = useRef(new Map());
  const bitrateAdjustmentRef = useRef({ lastAdjustedAt: 0 });
  const renegotiationRef = useRef({ lastAt: 0, key: '' });
  const lastIceFetchAtRef = useRef(0);
  const iceConfigurationRef = useRef({ iceServers: DEFAULT_ICE_SERVERS });
  const analyserNodeRef = useRef(null);
  const monitorNodeRef = useRef(null);
  const micTestEnabledRef = useRef(false);
  const micTestFrameRef = useRef(0);
  const voiceMusicStateRef = useRef(voiceMusicState);
  const voiceMusicWatchChannelRef = useRef(null);
  const sharedMusicAudioRef = useRef(null);
  const sharedMusicYoutubeHostRef = useRef(null);
  const sharedMusicYoutubePlayerRef = useRef(null);
  const sharedMusicYoutubeApiPromiseRef = useRef(null);
  const sharedMusicTrackRef = useRef('');
  const sharedMusicDurationSentRef = useRef('');

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    voiceMusicStateRef.current = voiceMusicState;
  }, [voiceMusicState]);

  useEffect(() => {
    iceConfigurationRef.current = iceConfiguration;
  }, [iceConfiguration]);

  useEffect(() => {
    lastIceFetchAtRef.current = 0;
  }, [activeView?.id, activeServerApi]);

  const updateRemoteAudioStreams = useCallback(() => {
    setRemoteAudioStreams([...remoteStreamsRef.current.entries()].map(([userId, stream]) => ({ userId, stream })));
  }, []);

  const getAudioConstraint = useCallback(
    (deviceId) => buildAudioConstraint(deviceId, audioProcessing),
    [audioProcessing]
  );

  const refreshIceConfiguration = useCallback(
    async (force = false) => {
      const defaultConfig = { iceServers: DEFAULT_ICE_SERVERS };

      if (activeView?.type !== 'server') {
        setIceConfiguration(defaultConfig);
        return defaultConfig;
      }

      const now = Date.now();
      if (!force && now - lastIceFetchAtRef.current < 2 * 60 * 1000) {
        return iceConfigurationRef.current;
      }

      if (!activeServerApi?.getVoiceIceConfig) {
        setIceConfiguration(defaultConfig);
        return defaultConfig;
      }

      try {
        const payload = await activeServerApi.getVoiceIceConfig();
        const nextConfig = {
          iceServers: normalizeIceServerList(payload?.iceServers),
        };
        setIceConfiguration(nextConfig);
        lastIceFetchAtRef.current = Date.now();
        return nextConfig;
      } catch {
        setIceConfiguration(defaultConfig);
        return defaultConfig;
      }
    },
    [activeView?.type, activeServerApi]
  );

  useEffect(() => {
    refreshIceConfiguration(false);
  }, [refreshIceConfiguration, activeView?.id]);

  const getCurrentTargetBitrate = useCallback(
    () => clampBitrateForMode(targetAudioBitrate, voiceQualityMode),
    [targetAudioBitrate, voiceQualityMode]
  );

  const getCurrentFmtpMaxBitrate = useCallback(() => {
    const profile = getVoiceQualityProfile(voiceQualityMode);
    return profile.maxBitrate;
  }, [voiceQualityMode]);

  const getCurrentSenderOptions = useCallback(
    () => ({
      maxBitrate: getCurrentTargetBitrate(),
      lowLatencyMode,
      prioritizeVoicePackets,
    }),
    [getCurrentTargetBitrate, lowLatencyMode, prioritizeVoicePackets]
  );

  const getCurrentSdpOptions = useCallback(
    () => ({
      maxAverageBitrate: getCurrentFmtpMaxBitrate(),
      fecEnabled: effectiveFecEnabled,
      lowLatencyMode,
    }),
    [getCurrentFmtpMaxBitrate, effectiveFecEnabled, lowLatencyMode]
  );

  const getVoiceMusicDerivedPosition = useCallback((snapshot, nowMs = Date.now()) => {
    const basePosition = clampMusicSeconds(snapshot?.positionSec);
    if (snapshot?.playbackState !== 'playing') return basePosition;
    const serverNowMs = Number(snapshot?.serverNowMs);
    if (!Number.isFinite(serverNowMs)) return basePosition;
    const driftSec = Math.max(0, (nowMs - serverNowMs) / 1000);
    return clampMusicSeconds(basePosition + driftSec);
  }, []);

  const resolveVoiceMusicChannelId = useCallback(
    (channelId) => {
      if (channelId) return String(channelId);
      if (joinedVoiceChannelRef.current) return String(joinedVoiceChannelRef.current);
      if (voiceMusicWatchChannelRef.current) return String(voiceMusicWatchChannelRef.current);
      if (activeVoiceChannelId) return String(activeVoiceChannelId);
      return null;
    },
    [activeVoiceChannelId]
  );

  const emitVoiceMusicControl = useCallback(
    (eventName, channelId, payload = {}) => {
      const targetChannelId = resolveVoiceMusicChannelId(channelId);
      if (!targetChannelId || !socketRef.current) return false;
      setVoiceMusicError('');
      socketRef.current.emit(eventName, {
        channelId: targetChannelId,
        ...payload,
      });
      return true;
    },
    [resolveVoiceMusicChannelId]
  );

  const requestVoiceMusicState = useCallback(
    (channelId) => {
      const targetChannelId = resolveVoiceMusicChannelId(channelId);
      if (!targetChannelId || !socketRef.current) return false;
      voiceMusicWatchChannelRef.current = targetChannelId;
      socketRef.current.emit('voice:music:state:request', { channelId: targetChannelId });
      return true;
    },
    [resolveVoiceMusicChannelId]
  );

  const enqueueVoiceMusic = useCallback(
    ({ channelId, url, title = '', coverUrl = null, durationSec = null } = {}) => {
      const trimmedUrl = String(url || '').trim();
      if (!trimmedUrl) return false;
      return emitVoiceMusicControl('voice:music:enqueue', channelId, {
        url: trimmedUrl,
        title: String(title || '').trim(),
        coverUrl: coverUrl || null,
        durationSec: Number.isFinite(Number(durationSec)) ? Number(durationSec) : null,
      });
    },
    [emitVoiceMusicControl]
  );

  const playVoiceMusic = useCallback((channelId) => (
    emitVoiceMusicControl('voice:music:play', channelId)
  ), [emitVoiceMusicControl]);

  const pauseVoiceMusic = useCallback((channelId) => (
    emitVoiceMusicControl('voice:music:pause', channelId)
  ), [emitVoiceMusicControl]);

  const toggleVoiceMusicPlayback = useCallback((channelId) => {
    const snapshot = voiceMusicStateRef.current;
    if (snapshot.playbackState === 'playing') {
      return emitVoiceMusicControl('voice:music:pause', channelId);
    }
    return emitVoiceMusicControl('voice:music:play', channelId);
  }, [emitVoiceMusicControl]);

  const seekVoiceMusic = useCallback((channelId, positionSec) => (
    emitVoiceMusicControl('voice:music:seek', channelId, { positionSec: clampMusicSeconds(positionSec) })
  ), [emitVoiceMusicControl]);

  const skipVoiceMusicNext = useCallback((channelId) => (
    emitVoiceMusicControl('voice:music:next', channelId)
  ), [emitVoiceMusicControl]);

  const skipVoiceMusicPrevious = useCallback((channelId) => (
    emitVoiceMusicControl('voice:music:previous', channelId)
  ), [emitVoiceMusicControl]);

  const selectVoiceMusicTrack = useCallback((channelId, trackId) => {
    const safeTrackId = String(trackId || '').trim();
    if (!safeTrackId) return false;
    return emitVoiceMusicControl('voice:music:set-current', channelId, { trackId: safeTrackId });
  }, [emitVoiceMusicControl]);

  const removeVoiceMusicTrack = useCallback((channelId, trackId) => {
    const safeTrackId = String(trackId || '').trim();
    if (!safeTrackId) return false;
    return emitVoiceMusicControl('voice:music:remove', channelId, { trackId: safeTrackId });
  }, [emitVoiceMusicControl]);

  const clearVoiceMusicQueue = useCallback((channelId) => (
    emitVoiceMusicControl('voice:music:clear', channelId)
  ), [emitVoiceMusicControl]);

  useEffect(() => {
    if (!socket) return;
    if (activeChannel?.type !== 'voice' || !activeChannel?.id) {
      if (!joinedVoiceChannelRef.current) {
        voiceMusicWatchChannelRef.current = null;
      }
      return;
    }

    voiceMusicWatchChannelRef.current = activeChannel.id;
    requestVoiceMusicState(activeChannel.id);
  }, [socket, activeChannel?.id, activeChannel?.type, requestVoiceMusicState]);

  const isPushToTalkMode = inputMode === INPUT_MODES.ptt;
  const effectiveSelfMuted = selfMuted || (isPushToTalkMode && !pttPressed);

  const destroyAudioPipeline = useCallback(() => {
    try { sourceNodeRef.current?.disconnect(); } catch {}
    try { gainNodeRef.current?.disconnect(); } catch {}
    try { analyserNodeRef.current?.disconnect(); } catch {}
    try { monitorNodeRef.current?.disconnect(); } catch {}
    try { destinationNodeRef.current?.disconnect(); } catch {}

    sourceNodeRef.current = null;
    gainNodeRef.current = null;
    analyserNodeRef.current = null;
    monitorNodeRef.current = null;
    destinationNodeRef.current = null;

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const stopStreamTracks = useCallback((stream) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
  }, []);

  const applyTrackConstraints = useCallback(
    async (stream) => {
      if (!stream) return;
      const constraints = buildTrackConstraint(audioProcessing);
      await Promise.all(
        stream.getAudioTracks().map((track) => track.applyConstraints(constraints).catch(() => {}))
      );
    },
    [audioProcessing]
  );

  const buildOutgoingAudioStream = useCallback(
    async (microphoneStream) => {
      const [sourceTrack] = microphoneStream?.getAudioTracks?.() || [];
      if (!sourceTrack) {
        throw new Error('No audio track from selected input device');
      }

      destroyAudioPipeline();

      const AudioContextClass =
        (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;
      if (!AudioContextClass || typeof MediaStream !== 'function') {
        return { stream: microphoneStream, track: sourceTrack };
      }

      try {
        const context = new AudioContextClass({ sampleRate: 48000, latencyHint: 'interactive' });
        const sourceNode = context.createMediaStreamSource(microphoneStream);
        const gainNode = context.createGain();
        const analyserNode = context.createAnalyser();
        const destinationNode = context.createMediaStreamDestination();
        const monitorNode = context.createGain();
        gainNode.gain.value = clamp(inputGain / 100, 0, 2);
        analyserNode.fftSize = 1024;
        analyserNode.smoothingTimeConstant = 0.75;
        monitorNode.gain.value = micTestEnabledRef.current ? 0.8 : 0;

        sourceNode.connect(gainNode);
        gainNode.connect(analyserNode);
        gainNode.connect(destinationNode);
        analyserNode.connect(monitorNode);
        monitorNode.connect(context.destination);

        const processedTrack = destinationNode.stream.getAudioTracks()[0];
        if (!processedTrack) {
          context.close().catch(() => {});
          return { stream: microphoneStream, track: sourceTrack };
        }

        processedTrack.enabled = sourceTrack.enabled;
        const processedStream = new MediaStream([processedTrack]);

        audioContextRef.current = context;
        sourceNodeRef.current = sourceNode;
        gainNodeRef.current = gainNode;
        analyserNodeRef.current = analyserNode;
        monitorNodeRef.current = monitorNode;
        destinationNodeRef.current = destinationNode;

        return { stream: processedStream, track: processedTrack };
      } catch {
        destroyAudioPipeline();
        return { stream: microphoneStream, track: sourceTrack };
      }
    },
    [destroyAudioPipeline, inputGain]
  );

  const replacePeerAudioTrack = useCallback(async (stream, track, senderOptions) => {
    const replaceTrackPromises = [];
    peersRef.current.forEach((peer) => {
      const sender = peer.getSenders().find((s) => s.track?.kind === 'audio');
      if (sender) {
        replaceTrackPromises.push(
          sender.replaceTrack(track).then(() => optimizeAudioSender(sender, senderOptions)).catch(() => {})
        );
      } else {
        const newSender = peer.addTrack(track, stream);
        replaceTrackPromises.push(optimizeAudioSender(newSender, senderOptions));
      }
    });
    await Promise.all(replaceTrackPromises);
  }, []);

  const applyTargetBitrateToPeers = useCallback(async (senderOptions) => {
    const tasks = [];
    peersRef.current.forEach((peer) => {
      const sender = peer.getSenders().find((s) => s.track?.kind === 'audio');
      if (sender) {
        tasks.push(optimizeAudioSender(sender, senderOptions));
      }
    });
    await Promise.all(tasks);
  }, []);

  const collectVoiceMetrics = useCallback(async () => {
    const peerEntries = [...peersRef.current.entries()];
    if (peerEntries.length === 0) {
      return {
        measuredBitrateKbps: null,
        packetLossPercent: null,
        jitterMs: null,
        rttMs: null,
      };
    }

  const nowMs = Date.now();
  const bitrateSamples = [];
  const lossSamples = [];
  const jitterSamples = [];
  const rttSamples = [];
  const toFiniteNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

    await Promise.all(
      peerEntries.map(async ([remoteUserId, peer]) => {
        if (!peer?.getStats) return;

        try {
          const stats = await peer.getStats();
          const reports = new Map();
          stats.forEach((report) => {
            reports.set(report.id, report);
          });

          let outbound = null;
          let remoteInbound = null;
          let inbound = null;
          let selectedPair = null;
          let transport = null;
          const outboundCandidates = [];
          const remoteInboundCandidates = [];
          const inboundCandidates = [];
          const candidatePairCandidates = [];
          const isLikelyAudioReport = (report) => {
            if (!report) return false;
            if (report.kind === 'audio' || report.mediaType === 'audio') return true;
            if (report.kind === 'video' || report.mediaType === 'video') return false;
            return true;
          };

          stats.forEach((report) => {
            if (
              report.type === 'outbound-rtp'
              && !report.isRemote
            ) {
              outboundCandidates.push(report);
            } else if (
              report.type === 'remote-inbound-rtp'
            ) {
              remoteInboundCandidates.push(report);
            } else if (
              report.type === 'inbound-rtp'
              && !report.isRemote
            ) {
              inboundCandidates.push(report);
            } else if (
              report.type === 'candidate-pair'
            ) {
              candidatePairCandidates.push(report);
            } else if (report.type === 'transport') {
              transport = report;
            }
          });

          outbound = outboundCandidates.find(isLikelyAudioReport) || outboundCandidates[0] || null;
          remoteInbound = remoteInboundCandidates.find(isLikelyAudioReport) || remoteInboundCandidates[0] || null;
          inbound = inboundCandidates.find(isLikelyAudioReport) || inboundCandidates[0] || null;

          if (transport?.selectedCandidatePairId) {
            const maybePair = reports.get(transport.selectedCandidatePairId);
            if (maybePair && maybePair.type === 'candidate-pair') {
              selectedPair = maybePair;
            }
          }
          if (!selectedPair) {
            selectedPair = candidatePairCandidates.find((pair) => (
              (pair.selected || pair.nominated) && pair.state === 'succeeded'
            )) || candidatePairCandidates[0] || null;
          }

          if (!remoteInbound && outbound?.remoteId && reports.has(outbound.remoteId)) {
            const linked = reports.get(outbound.remoteId);
            if (linked?.type === 'remote-inbound-rtp') {
              remoteInbound = linked;
            }
          }
          if (!remoteInbound && inbound?.remoteId && reports.has(inbound.remoteId)) {
            const linked = reports.get(inbound.remoteId);
            if (linked?.type === 'remote-inbound-rtp') {
              remoteInbound = linked;
            }
          }

          const cacheKey = remoteUserId;
          const prev = senderStatsCacheRef.current.get(cacheKey);
          let bitrateSampleAdded = false;
          const outboundBytesSent = toFiniteNumber(outbound?.bytesSent);

          if (outbound && prev?.timestampMs && outboundBytesSent !== null) {
            const deltaBytes = outboundBytesSent - Number(prev.bytesSent || 0);
            const deltaSeconds = Math.max((nowMs - prev.timestampMs) / 1000, 0.001);
            if (deltaBytes >= 0) {
              bitrateSamples.push((deltaBytes * 8) / 1000 / deltaSeconds);
              bitrateSampleAdded = true;
            }
          }

          const pairBytes = selectedPair
            ? (toFiniteNumber(selectedPair.bytesSent) || 0) + (toFiniteNumber(selectedPair.bytesReceived) || 0)
            : null;
          if (!bitrateSampleAdded && prev?.timestampMs && pairBytes !== null && Number.isFinite(prev.pairBytes)) {
            const deltaBytes = pairBytes - Number(prev.pairBytes || 0);
            const deltaSeconds = Math.max((nowMs - prev.timestampMs) / 1000, 0.001);
            if (deltaBytes >= 0) {
              bitrateSamples.push((deltaBytes * 8) / 1000 / deltaSeconds);
            }
          }

          if (outbound && remoteInbound) {
            const currSent = Number(outbound.packetsSent || 0);
            const currLost = Number(remoteInbound.packetsLost || 0);
            const prevSent = Number(prev?.packetsSent || 0);
            const prevLost = Number(prev?.packetsLost || 0);

            const deltaSent = currSent - prevSent;
            const deltaLost = currLost - prevLost;
            const total = deltaSent + Math.max(deltaLost, 0);
            if (total > 0 && deltaSent >= 0 && deltaLost >= 0) {
              lossSamples.push((deltaLost / total) * 100);
            }
          } else if (inbound) {
            const currReceived = Number(inbound.packetsReceived || 0);
            const currLost = Number(inbound.packetsLost || 0);
            const prevReceived = Number(prev?.inboundPacketsReceived || 0);
            const prevLost = Number(prev?.inboundPacketsLost || 0);

            const deltaReceived = currReceived - prevReceived;
            const deltaLost = currLost - prevLost;
            const total = deltaReceived + Math.max(deltaLost, 0);
            if (total > 0 && deltaReceived >= 0 && deltaLost >= 0) {
              lossSamples.push((deltaLost / total) * 100);
            }
          }

          if (remoteInbound && Number.isFinite(remoteInbound.jitter)) {
            jitterSamples.push(Number(remoteInbound.jitter) * 1000);
          } else if (inbound && Number.isFinite(inbound.jitter)) {
            jitterSamples.push(Number(inbound.jitter) * 1000);
          }

          if (remoteInbound && Number.isFinite(remoteInbound.roundTripTime)) {
            rttSamples.push(Number(remoteInbound.roundTripTime) * 1000);
          } else if (inbound && Number.isFinite(inbound.roundTripTime)) {
            rttSamples.push(Number(inbound.roundTripTime) * 1000);
          } else if (selectedPair && Number.isFinite(selectedPair.currentRoundTripTime)) {
            rttSamples.push(Number(selectedPair.currentRoundTripTime) * 1000);
          }

          senderStatsCacheRef.current.set(cacheKey, {
            timestampMs: nowMs,
            bytesSent: outboundBytesSent || 0,
            packetsSent: Number(outbound?.packetsSent || 0),
            packetsLost: Number(remoteInbound?.packetsLost || prev?.packetsLost || 0),
            pairBytes,
            inboundPacketsReceived: Number(inbound?.packetsReceived || prev?.inboundPacketsReceived || 0),
            inboundPacketsLost: Number(inbound?.packetsLost || prev?.inboundPacketsLost || 0),
          });
        } catch {
          // stats can fail on browser transitions
        }
      })
    );

    const average = (arr) => (arr.length ? arr.reduce((sum, v) => sum + v, 0) / arr.length : null);
    return {
      measuredBitrateKbps: average(bitrateSamples) !== null ? Math.round(average(bitrateSamples)) : null,
      packetLossPercent: average(lossSamples) !== null ? Number(average(lossSamples).toFixed(2)) : null,
      jitterMs: average(jitterSamples) !== null ? Number(average(jitterSamples).toFixed(1)) : null,
      rttMs: average(rttSamples) !== null ? Math.round(average(rttSamples)) : null,
    };
  }, []);

  const refreshAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const nextInputDevices = allDevices
        .filter((device) => device.kind === 'audioinput')
        .map((device, index) => ({
          id: device.deviceId || `input-${index}`,
          label: device.label || `Microphone ${index + 1}`,
        }));

      const nextOutputDevices = allDevices
        .filter((device) => device.kind === 'audiooutput')
        .map((device, index) => ({
          id: device.deviceId || `output-${index}`,
          label: device.label || `Speaker ${index + 1}`,
        }));

      if (!nextInputDevices.some((device) => device.id === 'default')) {
        nextInputDevices.unshift({ id: 'default', label: 'System Default Microphone' });
      }
      if (!nextOutputDevices.some((device) => device.id === 'default')) {
        nextOutputDevices.unshift({ id: 'default', label: 'System Default Output' });
      }

      setInputDevices(nextInputDevices);
      setOutputDevices(nextOutputDevices);
    } catch {
      // ignore
    }
  }, []);

  const removePeerConnection = useCallback(
    (remoteUserId) => {
      const peer = peersRef.current.get(remoteUserId);
      if (peer) {
        peer.onicecandidate = null;
        peer.ontrack = null;
        peer.onconnectionstatechange = null;
        peer.close();
      }

      peersRef.current.delete(remoteUserId);
      remoteStreamsRef.current.delete(remoteUserId);
      senderStatsCacheRef.current.delete(remoteUserId);
      updateRemoteAudioStreams();
    },
    [updateRemoteAudioStreams]
  );

  const leaveVoice = useCallback((emitLeave = true) => {
    const channelId = joinedVoiceChannelRef.current;

    if (channelId && emitLeave && socketRef.current) {
      socketRef.current.emit('voice:leave', { channelId });
    }

    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    remoteStreamsRef.current.clear();
    setRemoteAudioStreams([]);

    stopStreamTracks(localStreamRef.current);
    if (microphoneStreamRef.current !== localStreamRef.current) {
      stopStreamTracks(microphoneStreamRef.current);
    }
    localStreamRef.current = null;
    microphoneStreamRef.current = null;
    destroyAudioPipeline();
    senderStatsCacheRef.current.clear();
    bitrateAdjustmentRef.current.lastAdjustedAt = 0;
    renegotiationRef.current.lastAt = 0;
    renegotiationRef.current.key = '';
    setPttPressed(false);
    setMicTestLevel(0);
    setVoiceNetworkStats({
      packetLossPercent: null,
      jitterMs: null,
      rttMs: null,
      measuredBitrateKbps: null,
    });

    joinedVoiceChannelRef.current = null;
    setActiveVoiceChannelId(null);
    setVoiceConnected(false);
    setJoiningVoice(false);
    setVoiceParticipants([]);
    setVoiceError('');
    setVoiceMusicError('');
    setVoiceMusicPositionSec(0);
  }, [destroyAudioPipeline, stopStreamTracks]);

  const ensurePeerConnection = useCallback(
    (remoteUserId) => {
      if (peersRef.current.has(remoteUserId)) {
        return peersRef.current.get(remoteUserId);
      }

      if (typeof RTCPeerConnection !== 'function') {
        setVoiceError('WebRTC is not available in this app environment.');
        return null;
      }

      let peer;
      try {
        peer = new RTCPeerConnection(iceConfiguration);
      } catch (err) {
        console.error('Failed to create RTCPeerConnection:', err);
        setVoiceError('Could not initialize voice connection.');
        return null;
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          const sender = peer.addTrack(track, localStreamRef.current);
          optimizeAudioSender(sender, getCurrentSenderOptions());
        });
      }

      peer.onicecandidate = (event) => {
        if (!event.candidate || !socketRef.current || !joinedVoiceChannelRef.current) return;
        socketRef.current.emit('voice:signal', {
          channelId: joinedVoiceChannelRef.current,
          targetUserId: remoteUserId,
          signal: { type: 'ice-candidate', candidate: event.candidate },
        });
      };

      peer.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        remoteStreamsRef.current.set(remoteUserId, stream);
        updateRemoteAudioStreams();
      };

      peer.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) {
          removePeerConnection(remoteUserId);
        }
      };

      peersRef.current.set(remoteUserId, peer);
      return peer;
    },
    [updateRemoteAudioStreams, removePeerConnection, getCurrentSenderOptions, iceConfiguration]
  );

  const syncVoicePeers = useCallback(
    async (participants) => {
      if (!localStreamRef.current || !user?.id) return;

      const remoteIds = participants.filter((p) => p.id !== user.id).map((p) => p.id);
      const remoteIdSet = new Set(remoteIds);

      [...peersRef.current.keys()].forEach((remoteUserId) => {
        if (!remoteIdSet.has(remoteUserId)) {
          removePeerConnection(remoteUserId);
        }
      });

      for (const remoteUserId of remoteIds) {
        const peer = ensurePeerConnection(remoteUserId);
        if (!peer) continue;
        const shouldInitiateOffer = user.id.localeCompare(remoteUserId) < 0;
        if (!shouldInitiateOffer || peer.localDescription) continue;

        try {
          const offer = await peer.createOffer();
          const tunedOffer = { ...offer, sdp: tuneOpusSdp(offer.sdp, getCurrentSdpOptions()) };
          await peer.setLocalDescription(tunedOffer);
          socketRef.current?.emit('voice:signal', {
            channelId: joinedVoiceChannelRef.current,
            targetUserId: remoteUserId,
            signal: { type: 'offer', sdp: tunedOffer },
          });
        } catch (err) {
          console.error('Failed to create voice offer:', err);
        }
      }
    },
    [user?.id, ensurePeerConnection, removePeerConnection, getCurrentSdpOptions]
  );

  useEffect(() => {
    if (!socket) return;

    const handleVoiceState = ({ channelId, participants }) => {
      if (channelId !== joinedVoiceChannelRef.current) return;
      const nextParticipants = participants || [];
      setVoiceParticipants(nextParticipants);
      if (localStreamRef.current) {
        syncVoicePeers(nextParticipants);
      }
    };

    const handleVoiceSignal = async ({ channelId, fromUserId, signal }) => {
      if (!joinedVoiceChannelRef.current) return;
      if (!channelId || !fromUserId || !signal) return;
      if (joinedVoiceChannelRef.current !== channelId) return;

      try {
        const peer = ensurePeerConnection(fromUserId);
        if (!peer) return;

        if (signal.type === 'offer' && signal.sdp) {
          if (typeof RTCSessionDescription !== 'function') {
            setVoiceError('RTC session descriptions are not supported.');
            return;
          }
          await peer.setRemoteDescription(
            new RTCSessionDescription({
              ...signal.sdp,
              sdp: tuneOpusSdp(signal.sdp?.sdp, getCurrentSdpOptions()),
            })
          );
          const answer = await peer.createAnswer();
          const tunedAnswer = { ...answer, sdp: tuneOpusSdp(answer.sdp, getCurrentSdpOptions()) };
          await peer.setLocalDescription(tunedAnswer);
          socket.emit('voice:signal', {
            channelId,
            targetUserId: fromUserId,
            signal: { type: 'answer', sdp: tunedAnswer },
          });
        }

        if (signal.type === 'answer' && signal.sdp) {
          if (typeof RTCSessionDescription !== 'function') {
            setVoiceError('RTC session descriptions are not supported.');
            return;
          }
          await peer.setRemoteDescription(
            new RTCSessionDescription({
              ...signal.sdp,
              sdp: tuneOpusSdp(signal.sdp?.sdp, getCurrentSdpOptions()),
            })
          );
        }

        if (signal.type === 'ice-candidate' && signal.candidate) {
          if (typeof RTCIceCandidate !== 'function') {
            setVoiceError('RTC ICE candidates are not supported.');
            return;
          }
          await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.error('Voice signaling error:', err);
      }
    };

    const handleVoiceMusicState = (payload) => {
      const nextState = normalizeVoiceMusicState(payload);
      if (!nextState.channelId) return;

      const joinedChannelId = joinedVoiceChannelRef.current;
      const watchedChannelId = voiceMusicWatchChannelRef.current;
      if (nextState.channelId !== joinedChannelId && nextState.channelId !== watchedChannelId) {
        return;
      }

      setVoiceMusicState(nextState);
      setVoiceMusicError('');
    };

    const handleVoiceMusicError = (payload) => {
      const channelId = payload?.channelId ? String(payload.channelId) : null;
      const joinedChannelId = joinedVoiceChannelRef.current;
      const watchedChannelId = voiceMusicWatchChannelRef.current;
      if (channelId && channelId !== joinedChannelId && channelId !== watchedChannelId) return;
      const message = String(payload?.message || 'Music action failed.');
      setVoiceMusicError(message);
    };

    socket.on('voice:state', handleVoiceState);
    socket.on('voice:signal', handleVoiceSignal);
    socket.on('voice:music:state', handleVoiceMusicState);
    socket.on('voice:music:error', handleVoiceMusicError);

    return () => {
      socket.off('voice:state', handleVoiceState);
      socket.off('voice:signal', handleVoiceSignal);
      socket.off('voice:music:state', handleVoiceMusicState);
      socket.off('voice:music:error', handleVoiceMusicError);
    };
  }, [socket, syncVoicePeers, ensurePeerConnection, getCurrentSdpOptions]);

  useEffect(() => {
    refreshAudioDevices();
    if (!navigator.mediaDevices) return;

    const handler = () => refreshAudioDevices();

    if (typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', handler);
      return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
    }

    navigator.mediaDevices.ondevicechange = handler;
    return () => {
      navigator.mediaDevices.ondevicechange = null;
    };
  }, [refreshAudioDevices]);

  useEffect(() => {
    localStorage.setItem(
      VOICE_SETTINGS_KEY,
      JSON.stringify({
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
        inputMode,
        pttKey,
        micTestEnabled,
      })
    );
  }, [
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
    inputMode,
    pttKey,
    micTestEnabled,
  ]);

  useEffect(() => {
    return () => leaveVoice(true);
  }, []);

  const joinVoice = useCallback(
    async (channelId) => {
      if (!socket || voiceConnected || joiningVoice) return;

      if (joinedVoiceChannelRef.current && joinedVoiceChannelRef.current !== channelId) {
        leaveVoice(true);
      }

      setVoiceError('');
      setJoiningVoice(true);

      try {
        await refreshIceConfiguration(true);

        // Try to acquire microphone — fall back to listen-only if no device is available
        let stream = null;
        let listenOnly = false;

        if (!navigator.mediaDevices?.getUserMedia) {
          listenOnly = true;
        } else {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: getAudioConstraint(selectedInputDeviceId),
              video: false,
            });
          } catch (err) {
            const deviceErrors = ['NotFoundError', 'DevicesNotFoundError', 'NotReadableError', 'OverconstrainedError'];
            if (!deviceErrors.includes(err?.name)) throw err; // re-throw permission denied etc.
            listenOnly = true;
          }
        }

        if (!listenOnly && stream) {
          await applyTrackConstraints(stream);
          microphoneStreamRef.current = stream;
          const { stream: outgoingStream } = await buildOutgoingAudioStream(stream);
          localStreamRef.current = outgoingStream;
          stream.getAudioTracks().forEach((track) => { track.enabled = !effectiveSelfMuted; });
          outgoingStream.getAudioTracks().forEach((track) => { track.enabled = !effectiveSelfMuted; });
        }

        joinedVoiceChannelRef.current = channelId;
        setActiveVoiceChannelId(channelId);
        setVoiceConnected(true);

        socket.emit('voice:join', { channelId });
        socket.emit('voice:state:request', { channelId });
        socket.emit('voice:music:state:request', { channelId });
        voiceMusicWatchChannelRef.current = channelId;
        refreshAudioDevices();
      } catch (err) {
        console.error(err);
        setVoiceError(err?.message || 'Could not access your microphone.');

        stopStreamTracks(localStreamRef.current);
        if (microphoneStreamRef.current !== localStreamRef.current) {
          stopStreamTracks(microphoneStreamRef.current);
        }
        localStreamRef.current = null;
        microphoneStreamRef.current = null;
        destroyAudioPipeline();

        joinedVoiceChannelRef.current = null;
        setActiveVoiceChannelId(null);
        setVoiceConnected(false);
      } finally {
        setJoiningVoice(false);
      }
    },
    [
      socket,
      voiceConnected,
      joiningVoice,
      effectiveSelfMuted,
      leaveVoice,
      getAudioConstraint,
      selectedInputDeviceId,
      refreshAudioDevices,
      applyTrackConstraints,
      buildOutgoingAudioStream,
      stopStreamTracks,
      destroyAudioPipeline,
      refreshIceConfiguration,
    ]
  );

  const toggleSelfMute = useCallback(() => setSelfMuted((prev) => !prev), []);
  const toggleDeafen = useCallback(() => setDeafened((prev) => !prev), []);

  const toggleUserMute = useCallback((userId) => {
    setMutedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const setInputDevice = useCallback(
    async (deviceId) => {
      const nextDeviceId = deviceId || 'default';
      setSelectedInputDeviceId(nextDeviceId);

      if (!joinedVoiceChannelRef.current || !navigator.mediaDevices?.getUserMedia) return;

      try {
        const nextMicrophoneStream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraint(nextDeviceId),
          video: false,
        });

        await applyTrackConstraints(nextMicrophoneStream);
        const { stream: nextOutgoingStream, track: nextTrack } = await buildOutgoingAudioStream(nextMicrophoneStream);

        nextMicrophoneStream.getAudioTracks().forEach((track) => { track.enabled = !effectiveSelfMuted; });
        nextOutgoingStream.getAudioTracks().forEach((track) => { track.enabled = !effectiveSelfMuted; });

        await replacePeerAudioTrack(nextOutgoingStream, nextTrack, getCurrentSenderOptions());

        stopStreamTracks(localStreamRef.current);
        if (microphoneStreamRef.current !== localStreamRef.current) {
          stopStreamTracks(microphoneStreamRef.current);
        }
        microphoneStreamRef.current = nextMicrophoneStream;
        localStreamRef.current = nextOutgoingStream;
        setVoiceError('');
      } catch (err) {
        console.error('Failed to switch input device:', err);
        setVoiceError('Could not switch microphone.');
      }
    },
    [
      getAudioConstraint,
      effectiveSelfMuted,
      applyTrackConstraints,
      buildOutgoingAudioStream,
      replacePeerAudioTrack,
      stopStreamTracks,
      getCurrentSenderOptions,
    ]
  );

  const setOutputDevice = useCallback((deviceId) => {
    setSelectedOutputDeviceId(deviceId || 'default');
  }, []);

  const setInputGain = useCallback((value) => {
    setInputGainState(clamp(Number(value) || 0, 0, 200));
  }, []);

  const setOutputVolume = useCallback((value) => {
    setOutputVolumeState(clamp(Number(value) || 0, 0, 200));
  }, []);

  const setUserVolume = useCallback((userId, value) => {
    const nextVolume = clamp(Number(value) || 0, 0, 200);
    setUserVolumes((prev) => ({ ...prev, [userId]: nextVolume }));
  }, []);

  const setAudioProcessingOption = useCallback((key, enabled) => {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_AUDIO_PROCESSING_SETTINGS, key)) return;
    setAudioProcessing((prev) => ({
      ...prev,
      [key]: Boolean(enabled),
    }));
  }, []);

  const setVoiceQualityMode = useCallback((mode) => {
    const normalizedMode = normalizeVoiceQualityMode(mode);
    setVoiceQualityModeState(normalizedMode);
    setTargetAudioBitrate((prev) => {
      const profile = getVoiceQualityProfile(normalizedMode);
      if (profile.adaptive) {
        return clampBitrateForMode(prev, normalizedMode);
      }
      return profile.targetBitrate;
    });
    bitrateAdjustmentRef.current.lastAdjustedAt = 0;
  }, []);

  const setFecMode = useCallback((mode) => {
    setFecModeState(normalizeFecMode(mode));
  }, []);

  const setLowLatencyMode = useCallback((enabled) => {
    setLowLatencyModeState(Boolean(enabled));
  }, []);

  const setPrioritizeVoicePackets = useCallback((enabled) => {
    setPrioritizeVoicePacketsState(Boolean(enabled));
  }, []);

  const setInputMode = useCallback((mode) => {
    const next = normalizeInputMode(mode);
    setInputModeState(next);
    if (next !== INPUT_MODES.ptt) {
      setPttPressed(false);
    }
  }, []);

  const setPttKey = useCallback((keyCode) => {
    const value = String(keyCode || 'Space').trim();
    setPttKeyState(value || 'Space');
  }, []);

  const setMicTestEnabled = useCallback((enabled) => {
    const next = Boolean(enabled);
    micTestEnabledRef.current = next;
    setMicTestEnabledState(next);
  }, []);

  const renegotiateVoicePeers = useCallback(async () => {
    if (!joinedVoiceChannelRef.current || !user?.id) return;

    const now = Date.now();
    if (now - renegotiationRef.current.lastAt < 1800) return;

    const signalingJobs = [];
    const sdpOptions = getCurrentSdpOptions();
    peersRef.current.forEach((peer, remoteUserId) => {
      if (!peer || peer.signalingState !== 'stable') return;

      const shouldInitiateOffer = user.id.localeCompare(remoteUserId) < 0;
      if (!shouldInitiateOffer) return;

      signalingJobs.push(
        (async () => {
          try {
            const offer = await peer.createOffer();
            const tunedOffer = { ...offer, sdp: tuneOpusSdp(offer.sdp, sdpOptions) };
            await peer.setLocalDescription(tunedOffer);
            socketRef.current?.emit('voice:signal', {
              channelId: joinedVoiceChannelRef.current,
              targetUserId: remoteUserId,
              signal: { type: 'offer', sdp: tunedOffer },
            });
          } catch {
            // ignore renegotiation failures per-peer
          }
        })()
      );
    });

    await Promise.all(signalingJobs);
    renegotiationRef.current.lastAt = now;
  }, [user?.id, getCurrentSdpOptions]);

  useEffect(() => {
    if (fecMode === FEC_MODES.on) {
      setEffectiveFecEnabled(true);
      return;
    }
    if (fecMode === FEC_MODES.off) {
      setEffectiveFecEnabled(false);
      return;
    }

    setEffectiveFecEnabled((prev) => {
      const loss = voiceNetworkStats.packetLossPercent;
      const jitter = voiceNetworkStats.jitterMs;

      if (!Number.isFinite(loss) && !Number.isFinite(jitter)) {
        return true;
      }

      if (prev) {
        if (Number.isFinite(loss) && loss <= 1.0 && Number.isFinite(jitter) && jitter <= 10) {
          return false;
        }
        return true;
      }

      if ((Number.isFinite(loss) && loss >= 2.0) || (Number.isFinite(jitter) && jitter >= 18)) {
        return true;
      }
      return false;
    });
  }, [fecMode, voiceNetworkStats.packetLossPercent, voiceNetworkStats.jitterMs]);

  useEffect(() => {
    if (inputMode !== INPUT_MODES.ptt) {
      setPttPressed(false);
      return;
    }

    const isEditableTarget = (target) => {
      if (typeof HTMLElement === 'undefined') return false;
      if (!target || !(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName?.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select';
    };

    const handleKeyDown = (event) => {
      if (event.code !== pttKey) return;
      if (isEditableTarget(event.target)) return;
      setPttPressed(true);
      event.preventDefault();
    };

    const handleKeyUp = (event) => {
      if (event.code !== pttKey) return;
      setPttPressed(false);
      event.preventDefault();
    };

    const handleBlur = () => setPttPressed(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [inputMode, pttKey]);

  useEffect(() => {
    if (micTestFrameRef.current) {
      cancelAnimationFrame(micTestFrameRef.current);
      micTestFrameRef.current = 0;
    }

    if (!micTestEnabled || !voiceConnected) {
      setMicTestLevel(0);
      if (monitorNodeRef.current) monitorNodeRef.current.gain.value = 0;
      return;
    }

    const analyser = analyserNodeRef.current;
    if (!analyser) {
      setMicTestLevel(0);
      return;
    }

    // Route processed audio to speakers so user hears themselves as others do
    if (monitorNodeRef.current) monitorNodeRef.current.gain.value = 0.8;

    let cancelled = false;
    const sampleBuffer = new Uint8Array(analyser.fftSize);

    const tick = () => {
      if (cancelled) return;
      analyser.getByteTimeDomainData(sampleBuffer);

      let sum = 0;
      for (let i = 0; i < sampleBuffer.length; i += 1) {
        const normalized = (sampleBuffer[i] - 128) / 128;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / sampleBuffer.length);
      const level = clamp(Math.round(rms * 240), 0, 100);
      setMicTestLevel(level);

      micTestFrameRef.current = requestAnimationFrame(tick);
    };

    micTestFrameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (micTestFrameRef.current) {
        cancelAnimationFrame(micTestFrameRef.current);
        micTestFrameRef.current = 0;
      }
    };
  }, [micTestEnabled, voiceConnected, inputGain, selectedInputDeviceId]);

  useEffect(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !effectiveSelfMuted;
    });
    microphoneStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !effectiveSelfMuted;
    });
  }, [effectiveSelfMuted]);

  useEffect(() => {
    if (!gainNodeRef.current) return;
    const nextGain = clamp(inputGain / 100, 0, 2);
    try {
      const ctx = audioContextRef.current;
      if (ctx?.currentTime !== undefined && typeof gainNodeRef.current.gain.setTargetAtTime === 'function') {
        gainNodeRef.current.gain.setTargetAtTime(nextGain, ctx.currentTime, 0.03);
      } else {
        gainNodeRef.current.gain.value = nextGain;
      }
    } catch {
      gainNodeRef.current.gain.value = nextGain;
    }
  }, [inputGain]);

  useEffect(() => {
    if (!joinedVoiceChannelRef.current) return;
    setInputDevice(selectedInputDeviceId);
  }, [audioProcessing, setInputDevice]);

  useEffect(() => {
    if (!voiceConnected || !joinedVoiceChannelRef.current) return;
    const key = `${lowLatencyMode ? 1 : 0}:${effectiveFecEnabled ? 1 : 0}`;
    if (renegotiationRef.current.key === key) return;
    renegotiationRef.current.key = key;
    renegotiateVoicePeers();
  }, [voiceConnected, lowLatencyMode, effectiveFecEnabled, renegotiateVoicePeers]);

  useEffect(() => {
    if (!voiceConnected) return;
    applyTargetBitrateToPeers(getCurrentSenderOptions());
  }, [voiceConnected, targetAudioBitrate, voiceQualityMode, lowLatencyMode, prioritizeVoicePackets, applyTargetBitrateToPeers, getCurrentSenderOptions]);

  useEffect(() => {
    if (!voiceConnected || !joinedVoiceChannelRef.current) return;

    let cancelled = false;
    const run = async () => {
      const metrics = await collectVoiceMetrics();
      if (cancelled) return;

      setVoiceNetworkStats(metrics);

      const profile = getVoiceQualityProfile(voiceQualityMode);
      if (!profile.adaptive) return;

      setTargetAudioBitrate((currentValue) => {
        const current = clampBitrateForMode(currentValue, voiceQualityMode);
        const packetLoss = metrics.packetLossPercent;
        const jitter = metrics.jitterMs;
        const rtt = metrics.rttMs;

        let next = current;
        if (Number.isFinite(packetLoss) && packetLoss >= 8) {
          next = Math.round(current * 0.78);
        } else if (
          (Number.isFinite(packetLoss) && packetLoss >= 4)
          || (Number.isFinite(jitter) && jitter >= 24)
          || (Number.isFinite(rtt) && rtt >= 230)
        ) {
          next = Math.round(current * 0.88);
        } else if (
          Number.isFinite(packetLoss) && packetLoss <= 1.2
          && Number.isFinite(jitter) && jitter <= 12
          && Number.isFinite(rtt) && rtt <= 140
        ) {
          next = current + 16000;
        } else if (
          Number.isFinite(packetLoss) && packetLoss <= 2.5
          && Number.isFinite(jitter) && jitter <= 18
          && Number.isFinite(rtt) && rtt <= 180
        ) {
          next = current + 8000;
        }

        next = clampBitrateForMode(next, voiceQualityMode);
        if (next === current) return current;

        const now = Date.now();
        const isDecrease = next < current;
        const cooldownMs = isDecrease ? 1500 : 4200;
        if (now - bitrateAdjustmentRef.current.lastAdjustedAt < cooldownMs) {
          return current;
        }

        bitrateAdjustmentRef.current.lastAdjustedAt = now;
        return next;
      });
    };

    run();
    const id = setInterval(run, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [voiceConnected, voiceQualityMode, collectVoiceMetrics]);

  useEffect(() => {
    const snapshot = voiceMusicState;
    if (!snapshot?.channelId || !snapshot.currentTrack) {
      setVoiceMusicPositionSec(0);
      return;
    }

    const tick = () => {
      const audio = sharedMusicAudioRef.current;
      const ytPlayer = sharedMusicYoutubePlayerRef.current;
      const isYouTubeTrack = snapshot.currentTrack?.playerType === 'youtube' && Boolean(snapshot.currentTrack?.videoId);
      if (
        isYouTubeTrack
        && ytPlayer
        && snapshot.channelId === joinedVoiceChannelRef.current
        && snapshot.currentTrack?.id === sharedMusicTrackRef.current
      ) {
        try {
          const ytCurrent = Number(ytPlayer.getCurrentTime?.() || 0);
          if (Number.isFinite(ytCurrent) && ytCurrent >= 0) {
            setVoiceMusicPositionSec(clampMusicSeconds(ytCurrent));
            return;
          }
        } catch {}
      }
      // readyState > 0 (HAVE_METADATA+) ensures audio actually has a loaded source.
      // Without this guard, a src-less audio element returns currentTime=0 (finite)
      // and masks the server-derived advancing position entirely.
      if (
        audio
        && audio.readyState > 0
        && Number.isFinite(audio.currentTime)
        && snapshot.channelId === joinedVoiceChannelRef.current
        && snapshot.currentTrack?.id === sharedMusicTrackRef.current
      ) {
        setVoiceMusicPositionSec(clampMusicSeconds(audio.currentTime));
        return;
      }
      setVoiceMusicPositionSec(getVoiceMusicDerivedPosition(snapshot));
    };

    tick();
    if (snapshot.playbackState !== 'playing') return undefined;

    const id = setInterval(tick, 280);
    return () => clearInterval(id);
  }, [voiceMusicState, getVoiceMusicDerivedPosition]);

  const handleSharedMusicEnded = useCallback(() => {
    const snapshot = voiceMusicStateRef.current;
    const channelId = snapshot?.channelId || joinedVoiceChannelRef.current;
    const trackId = snapshot?.currentTrack?.id;
    if (!channelId || !trackId || !socketRef.current) return;
    socketRef.current.emit('voice:music:track:ended', { channelId, trackId });
  }, []);

  const handleSharedMusicMetadata = useCallback(() => {
    const audio = sharedMusicAudioRef.current;
    const snapshot = voiceMusicStateRef.current;
    if (!audio || !snapshot?.channelId || !snapshot?.currentTrack?.id || !socketRef.current) return;
    if (sharedMusicDurationSentRef.current === snapshot.currentTrack.id) return;

    const durationSec = Number(audio.duration);
    if (!Number.isFinite(durationSec) || durationSec <= 0) return;
    sharedMusicDurationSentRef.current = snapshot.currentTrack.id;
    socketRef.current.emit('voice:music:track:duration', {
      channelId: snapshot.channelId,
      trackId: snapshot.currentTrack.id,
      durationSec: clampMusicSeconds(durationSec),
    });
  }, []);

  const handleSharedMusicError = useCallback(() => {
    const snapshot = voiceMusicStateRef.current;
    if (!snapshot?.currentTrack?.isPlayable) return;
    setVoiceMusicError('Track could not be played on this device/link.');
  }, []);

  const ensureYouTubeApi = useCallback(() => {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (sharedMusicYoutubeApiPromiseRef.current) return sharedMusicYoutubeApiPromiseRef.current;

    sharedMusicYoutubeApiPromiseRef.current = new Promise((resolve, reject) => {
      let settled = false;
      let readyTimeoutId = 0;
      const settle = (handler, value) => {
        if (settled) return;
        settled = true;
        if (readyTimeoutId) {
          clearTimeout(readyTimeoutId);
        }
        handler(value);
      };
      const existingTag = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      const previousReadyCallback = window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousReadyCallback === 'function') {
          try { previousReadyCallback(); } catch {}
        }
        settle(resolve, window.YT || null);
      };

      if (!existingTag) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.onerror = () => settle(reject, new Error('Failed to load YouTube API'));
        document.head.appendChild(script);
      }

      readyTimeoutId = window.setTimeout(() => {
        if (window.YT?.Player) {
          settle(resolve, window.YT);
          return;
        }
        settle(reject, new Error('YouTube API timed out'));
      }, 9000);

      if (window.YT?.Player) {
        settle(resolve, window.YT);
      }
    }).catch(() => null);

    return sharedMusicYoutubeApiPromiseRef.current;
  }, []);

  const destroyYouTubePlayer = useCallback(() => {
    const player = sharedMusicYoutubePlayerRef.current;
    if (!player) return;
    try { player.stopVideo?.(); } catch {}
    try { player.destroy?.(); } catch {}
    sharedMusicYoutubePlayerRef.current = null;
  }, []);

  const ensureYouTubePlayer = useCallback(async (videoId) => {
    if (!videoId || !sharedMusicYoutubeHostRef.current) return null;
    const YT = await ensureYouTubeApi();
    if (!YT?.Player) return null;

    if (sharedMusicYoutubePlayerRef.current) {
      return sharedMusicYoutubePlayerRef.current;
    }

    return new Promise((resolve) => {
      try {
        const player = new YT.Player(sharedMusicYoutubeHostRef.current, {
          width: '0',
          height: '0',
          videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: () => {
              sharedMusicYoutubePlayerRef.current = player;
              resolve(player);
            },
            onStateChange: (event) => {
              if (event?.data !== YT.PlayerState.ENDED) return;
              const snapshot = voiceMusicStateRef.current;
              const channelId = snapshot?.channelId || joinedVoiceChannelRef.current;
              const trackId = snapshot?.currentTrack?.id;
              if (!channelId || !trackId || !socketRef.current) return;
              socketRef.current.emit('voice:music:track:ended', { channelId, trackId });
            },
            onError: () => {
              const snapshot = voiceMusicStateRef.current;
              if (!snapshot?.currentTrack?.isPlayable) return;
              setVoiceMusicError('YouTube playback failed for this track.');
            },
          },
        });
      } catch {
        resolve(null);
      }
    });
  }, [ensureYouTubeApi]);

  useEffect(() => {
    const audio = sharedMusicAudioRef.current;
    const snapshot = voiceMusicState;
    if (!audio) return;

    const shouldAttach = Boolean(
      voiceConnected
      && activeVoiceChannelId
      && snapshot.channelId
      && snapshot.channelId === activeVoiceChannelId
      && snapshot.currentTrack?.url
    );

    if (!shouldAttach) {
      audio.pause();
      audio.removeAttribute('src');
      sharedMusicTrackRef.current = '';
      sharedMusicDurationSentRef.current = '';
      const ytPlayer = sharedMusicYoutubePlayerRef.current;
      if (ytPlayer) {
        try { ytPlayer.stopVideo?.(); } catch {}
      }
      return;
    }

    const usesYouTubePlayer = snapshot.currentTrack?.playerType === 'youtube' && Boolean(snapshot.currentTrack?.videoId);
    if (usesYouTubePlayer) {
      audio.pause();
      audio.removeAttribute('src');

      ensureYouTubePlayer(snapshot.currentTrack.videoId).then((player) => {
        if (!player) return;
        const isTrackChanged = sharedMusicTrackRef.current !== snapshot.currentTrack.id;
        if (isTrackChanged && snapshot.currentTrack?.videoId) {
          try { player.loadVideoById(snapshot.currentTrack.videoId); } catch {}
          sharedMusicDurationSentRef.current = '';
          sharedMusicTrackRef.current = snapshot.currentTrack.id;
        }

        const targetPositionSec = getVoiceMusicDerivedPosition(snapshot);
        try {
          const current = Number(player.getCurrentTime?.() || 0);
          if (Number.isFinite(targetPositionSec) && Math.abs(current - targetPositionSec) > 1.5) {
            player.seekTo(targetPositionSec, true);
          }
        } catch {}

        try {
          if (deafened) {
            player.mute?.();
            player.setVolume?.(0);
          } else {
            player.unMute?.();
            player.setVolume?.(Math.round(clamp(outputVolume, 0, 200) / 2));
          }
        } catch {}

        if (snapshot.playbackState === 'playing') {
          try { player.playVideo?.(); } catch {}
        } else {
          try { player.pauseVideo?.(); } catch {}
        }

        if (sharedMusicDurationSentRef.current === snapshot.currentTrack.id) return;
        try {
          const durationSec = Number(player.getDuration?.() || 0);
          if (Number.isFinite(durationSec) && durationSec > 0 && socketRef.current) {
            sharedMusicDurationSentRef.current = snapshot.currentTrack.id;
            socketRef.current.emit('voice:music:track:duration', {
              channelId: snapshot.channelId,
              trackId: snapshot.currentTrack.id,
              durationSec: clampMusicSeconds(durationSec),
            });
          }
        } catch {}
      });

      if (sharedMusicTrackRef.current !== snapshot.currentTrack.id) {
        sharedMusicTrackRef.current = snapshot.currentTrack.id;
      }
      return;
    }

    const resolvedStreamUrl = String(
      snapshot.currentTrack?.streamUrl
      || (snapshot.currentTrack?.isPlayable ? snapshot.currentTrack?.url : '')
    ).trim();

    if (!resolvedStreamUrl) {
      audio.pause();
      audio.removeAttribute('src');
      sharedMusicTrackRef.current = snapshot.currentTrack.id;
      sharedMusicDurationSentRef.current = '';
      const ytPlayer = sharedMusicYoutubePlayerRef.current;
      if (ytPlayer) {
        try { ytPlayer.pauseVideo?.(); } catch {}
      }
      return;
    }

    const ytPlayer = sharedMusicYoutubePlayerRef.current;
    if (ytPlayer) {
      try { ytPlayer.pauseVideo?.(); } catch {}
    }

    if (sharedMusicTrackRef.current !== snapshot.currentTrack.id) {
      sharedMusicTrackRef.current = snapshot.currentTrack.id;
      sharedMusicDurationSentRef.current = '';
      audio.src = resolvedStreamUrl;
      audio.load();
    } else if (audio.src !== resolvedStreamUrl) {
      audio.src = resolvedStreamUrl;
      audio.load();
    }

    audio.muted = deafened;
    audio.volume = clamp(outputVolume / 100, 0, 1);

    if (typeof audio.setSinkId === 'function' && selectedOutputDeviceId) {
      audio.setSinkId(selectedOutputDeviceId).catch(() => {});
    }

    const targetPositionSec = getVoiceMusicDerivedPosition(snapshot);
    if (Number.isFinite(targetPositionSec) && Math.abs((audio.currentTime || 0) - targetPositionSec) > 1.2) {
      try {
        audio.currentTime = targetPositionSec;
      } catch {
        // Some streams reject random seeks
      }
    }

    if (snapshot.playbackState === 'playing' && !deafened) {
      audio.play().catch(() => {});
      return;
    }

    audio.pause();
  }, [
    voiceConnected,
    activeVoiceChannelId,
    voiceMusicState,
    outputVolume,
    selectedOutputDeviceId,
    deafened,
    getVoiceMusicDerivedPosition,
    ensureYouTubePlayer,
  ]);

  useEffect(() => {
    return () => {
      destroyYouTubePlayer();
    };
  }, [destroyYouTubePlayer]);

  const hasRemoteVoicePeers = (
    voiceParticipants.some((participant) => participant.id !== user?.id)
    || remoteAudioStreams.some((remote) => remote.userId !== user?.id)
  );
  const voiceHealth = evaluateVoiceHealth(voiceNetworkStats, hasRemoteVoicePeers, voiceConnected);

  return (
    <VoiceContext.Provider
      value={{
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
        voiceMusicState,
        voiceMusicPositionSec,
        voiceMusicError,
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
        setPttKey,
        setMicTestEnabled,
        requestVoiceMusicState,
        enqueueVoiceMusic,
        playVoiceMusic,
        pauseVoiceMusic,
        toggleVoiceMusicPlayback,
        seekVoiceMusic,
        skipVoiceMusicNext,
        skipVoiceMusicPrevious,
        selectVoiceMusicTrack,
        removeVoiceMusicTrack,
        clearVoiceMusicQueue,
      }}
    >
      {children}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          left: -9999,
          top: -9999,
          width: 1,
          height: 1,
          overflow: 'hidden',
          opacity: 0,
          pointerEvents: 'none',
        }}
      >
        {remoteAudioStreams.map(({ userId, stream }) => (
          <RemoteAudio
            key={userId}
            stream={stream}
            gain={clamp((outputVolume / 100) * ((Number(userVolumes[userId]) || 100) / 100), 0, 1)}
            muted={deafened || mutedUsers.has(userId)}
            outputDeviceId={selectedOutputDeviceId}
          />
        ))}
        <audio
          ref={sharedMusicAudioRef}
          autoPlay
          playsInline
          preload="metadata"
          onLoadedMetadata={handleSharedMusicMetadata}
          onEnded={handleSharedMusicEnded}
          onError={handleSharedMusicError}
        />
        <div
          ref={sharedMusicYoutubeHostRef}
          style={{ width: 1, height: 1, overflow: 'hidden' }}
        />
      </div>
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used within VoiceProvider');
  return ctx;
}
