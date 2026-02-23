import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';

const VoiceContext = createContext(null);
const VOICE_SETTINGS_KEY = 'nv_voice_settings';

const ICE_SERVERS = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ],
};

const HIGH_QUALITY_AUDIO_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  highpassFilter: false,
  channelCount: 2,
  sampleRate: 48000,
  sampleSize: 24,
  latency: 0,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
      };
    }

    const parsed = JSON.parse(raw);
    return {
      selectedInputDeviceId: parsed.selectedInputDeviceId || 'default',
      selectedOutputDeviceId: parsed.selectedOutputDeviceId || 'default',
      inputGain: clamp(Number(parsed.inputGain) || 100, 0, 200),
      outputVolume: clamp(Number(parsed.outputVolume) || 100, 0, 200),
      userVolumes: parsed.userVolumes && typeof parsed.userVolumes === 'object' ? parsed.userVolumes : {},
    };
  } catch {
    return {
      selectedInputDeviceId: 'default',
      selectedOutputDeviceId: 'default',
      inputGain: 100,
      outputVolume: 100,
      userVolumes: {},
    };
  }
}

function tuneOpusSdp(sdp) {
  if (!sdp || typeof sdp !== 'string') return sdp;

  const opusPayloadMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000\/2/i);
  if (!opusPayloadMatch) return sdp;

  const payloadType = opusPayloadMatch[1];
  const fmtpRegex = new RegExp(`a=fmtp:${payloadType}\\s([^\\r\\n]*)`, 'i');
  const fmtpMatch = sdp.match(fmtpRegex);

  const requiredParams = [
    'stereo=1',
    'sprop-stereo=1',
    'maxaveragebitrate=192000',
    'maxplaybackrate=48000',
    'cbr=0',
    'usedtx=0',
    'useinbandfec=1',
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

async function optimizeAudioSender(sender) {
  if (!sender || sender.track?.kind !== 'audio' || !sender.getParameters || !sender.setParameters) {
    return;
  }

  try {
    const params = sender.getParameters() || {};
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings = params.encodings.map((enc) => ({
      ...enc,
      maxBitrate: 192000,
      dtx: false,
    }));
    await sender.setParameters(params);
  } catch {
    // Browser may reject advanced sender params
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

  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const joinedVoiceChannelRef = useRef(null);
  const socketRef = useRef(socket);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  const updateRemoteAudioStreams = useCallback(() => {
    setRemoteAudioStreams([...remoteStreamsRef.current.entries()].map(([userId, stream]) => ({ userId, stream })));
  }, []);

  const getAudioConstraint = useCallback((deviceId) => {
    const constraint = { ...HIGH_QUALITY_AUDIO_CONSTRAINTS };
    if (deviceId && deviceId !== 'default') {
      constraint.deviceId = { exact: deviceId };
    }
    return constraint;
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
      updateRemoteAudioStreams();
    },
    [updateRemoteAudioStreams]
  );

  const leaveVoice = useCallback((emitLeave = true) => {
    const channelId = joinedVoiceChannelRef.current;
    if (!channelId) return;

    if (emitLeave && socketRef.current) {
      socketRef.current.emit('voice:leave', { channelId });
    }

    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    remoteStreamsRef.current.clear();
    setRemoteAudioStreams([]);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    joinedVoiceChannelRef.current = null;
    setActiveVoiceChannelId(null);
    setVoiceConnected(false);
    setJoiningVoice(false);
    setVoiceParticipants([]);
    setVoiceError('');
  }, []);

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
        peer = new RTCPeerConnection(ICE_SERVERS);
      } catch (err) {
        console.error('Failed to create RTCPeerConnection:', err);
        setVoiceError('Could not initialize voice connection.');
        return null;
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          const sender = peer.addTrack(track, localStreamRef.current);
          optimizeAudioSender(sender);
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
    [updateRemoteAudioStreams, removePeerConnection]
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
          const tunedOffer = { ...offer, sdp: tuneOpusSdp(offer.sdp) };
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
    [user?.id, ensurePeerConnection, removePeerConnection]
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
            new RTCSessionDescription({ ...signal.sdp, sdp: tuneOpusSdp(signal.sdp?.sdp) })
          );
          const answer = await peer.createAnswer();
          const tunedAnswer = { ...answer, sdp: tuneOpusSdp(answer.sdp) };
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
            new RTCSessionDescription({ ...signal.sdp, sdp: tuneOpusSdp(signal.sdp?.sdp) })
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

    socket.on('voice:state', handleVoiceState);
    socket.on('voice:signal', handleVoiceSignal);

    return () => {
      socket.off('voice:state', handleVoiceState);
      socket.off('voice:signal', handleVoiceSignal);
    };
  }, [socket, syncVoicePeers, ensurePeerConnection]);

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
      })
    );
  }, [selectedInputDeviceId, selectedOutputDeviceId, inputGain, outputVolume, userVolumes]);

  useEffect(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !selfMuted;
    });
  }, [selfMuted]);

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
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Microphone access is not supported in this environment.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraint(selectedInputDeviceId),
          video: false,
        });

        await Promise.all(
          stream.getAudioTracks().map((track) =>
            track.applyConstraints(HIGH_QUALITY_AUDIO_CONSTRAINTS).catch(() => {})
          )
        );

        localStreamRef.current = stream;
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !selfMuted;
        });

        joinedVoiceChannelRef.current = channelId;
        setActiveVoiceChannelId(channelId);
        setVoiceConnected(true);

        socket.emit('voice:join', { channelId });
        socket.emit('voice:state:request', { channelId });
        refreshAudioDevices();
      } catch (err) {
        console.error(err);
        setVoiceError(err?.message || 'Could not access your microphone.');

        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => track.stop());
          localStreamRef.current = null;
        }

        joinedVoiceChannelRef.current = null;
        setActiveVoiceChannelId(null);
        setVoiceConnected(false);
      } finally {
        setJoiningVoice(false);
      }
    },
    [socket, voiceConnected, joiningVoice, selfMuted, leaveVoice, getAudioConstraint, selectedInputDeviceId, refreshAudioDevices]
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
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraint(nextDeviceId),
          video: false,
        });

        await Promise.all(
          stream.getAudioTracks().map((track) =>
            track.applyConstraints(HIGH_QUALITY_AUDIO_CONSTRAINTS).catch(() => {})
          )
        );

        stream.getAudioTracks().forEach((track) => {
          track.enabled = !selfMuted;
        });

        const nextTrack = stream.getAudioTracks()[0];
        if (!nextTrack) throw new Error('No audio track from selected input device');

        const replaceTrackPromises = [];
        peersRef.current.forEach((peer) => {
          const sender = peer.getSenders().find((s) => s.track?.kind === 'audio');
          if (sender) {
            replaceTrackPromises.push(
              sender.replaceTrack(nextTrack).then(() => optimizeAudioSender(sender)).catch(() => {})
            );
          } else {
            const newSender = peer.addTrack(nextTrack, stream);
            replaceTrackPromises.push(optimizeAudioSender(newSender));
          }
        });
        await Promise.all(replaceTrackPromises);

        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        localStreamRef.current = stream;
        setVoiceError('');
      } catch (err) {
        console.error('Failed to switch input device:', err);
        setVoiceError('Could not switch microphone.');
      }
    },
    [getAudioConstraint, selfMuted]
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
        setInputDevice,
        setOutputDevice,
        setInputGain,
        setOutputVolume,
        setUserVolume,
      }}
    >
      {children}
      <div aria-hidden style={{ display: 'none' }}>
        {remoteAudioStreams.map(({ userId, stream }) => (
          <RemoteAudio
            key={userId}
            stream={stream}
            gain={clamp((outputVolume / 100) * ((Number(userVolumes[userId]) || 100) / 100), 0, 1)}
            muted={deafened || mutedUsers.has(userId)}
            outputDeviceId={selectedOutputDeviceId}
          />
        ))}
      </div>
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used within VoiceProvider');
  return ctx;
}
