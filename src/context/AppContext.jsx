import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import api, { getApiForServer } from '../utils/api';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState({ incoming: [], outgoing: [] });
  const [servers, setServers] = useState([]);
  const [activeView, setActiveView] = useState(null);
  const [activeChannel, setActiveChannel] = useState(null);
  const [serverDetails, setServerDetails] = useState({});
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [voiceChannelOccupancy, setVoiceChannelOccupancy] = useState(new Map());

  // Multi-server support: API client and socket for own/local servers
  const [activeServerApi, setActiveServerApi] = useState(() => api);
  const ownSocketRef = useRef(null);
  const [ownSocket, setOwnSocket] = useState(null);

  // In-memory DM store — relay-only, never persisted to disk
  const [dmMessages, setDmMessages] = useState({}); // friendId -> Message[]

  // Load initial data when user logs in
  useEffect(() => {
    if (!user) return;
    api.getFriends().then((d) => setFriends(d.friends)).catch(console.error);
    api.getPendingRequests().then((d) => setPendingRequests(d)).catch(console.error);
    api.getServers().then((d) => setServers(d.servers)).catch(console.error);
  }, [user]);

  // Tear down own-server socket when user logs out
  useEffect(() => {
    if (!user && ownSocketRef.current) {
      ownSocketRef.current.disconnect();
      ownSocketRef.current = null;
      setOwnSocket(null);
    }
  }, [user]);

  // ── Own/Local server socket management ─────────────────────────────────────

  const connectToOwnServer = useCallback((server) => {
    const serverUrl = server?.server_url;
    if (!serverUrl) return;

    // Already connected to the same server
    if (ownSocketRef.current && ownSocketRef.current.io.uri === serverUrl) return;

    // Disconnect from previous own server
    if (ownSocketRef.current) {
      ownSocketRef.current.disconnect();
      ownSocketRef.current = null;
    }

    const token = localStorage.getItem('nv_token');
    if (!token) return;

    const newSocket = io(serverUrl, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    newSocket.on('connect', () => {
      newSocket.emit('server:subscribe', { serverId: server.id });
    });

    ownSocketRef.current = newSocket;
    setOwnSocket(newSocket);
  }, []);

  const disconnectOwnServer = useCallback(() => {
    if (ownSocketRef.current) {
      ownSocketRef.current.disconnect();
      ownSocketRef.current = null;
      setOwnSocket(null);
    }
    setActiveServerApi(api);
  }, []);

  // ── Central socket event handlers ──────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const refreshFriendState = async () => {
      try {
        const [friendsData, pendingData] = await Promise.all([
          api.getFriends(),
          api.getPendingRequests(),
        ]);
        setFriends(friendsData.friends);
        setPendingRequests(pendingData);
      } catch (err) {
        console.error(err);
      }
    };

    const refreshServerState = async ({ serverId }) => {
      try {
        const serversData = await api.getServers();
        setServers(serversData.servers);

        const shouldRefreshDetails =
          Boolean(serverId) &&
          (activeView?.id === serverId || Boolean(serverDetails[serverId]));

        if (shouldRefreshDetails) {
          const serverObj = serversData.servers.find((s) => s.id === serverId);
          const serverApi = getApiForServer(serverObj);
          const details = await serverApi.getServer(serverId);
          setServerDetails((prev) => ({ ...prev, [serverId]: details }));
        }
      } catch (err) {
        console.error(err);
      }
    };

    const handleServerDeleted = ({ serverId }) => {
      setServers((prev) => prev.filter((s) => s.id !== serverId));
      setServerDetails((prev) => {
        const next = { ...prev };
        delete next[serverId];
        return next;
      });
      if (activeView?.type === 'server' && activeView.id === serverId) {
        setActiveView(null);
        setActiveChannel(null);
        disconnectOwnServer();
      }
    };

    // DM handler — handles both live relay and pending (offline) delivery
    const handleDMNew = ({ message, wasPending }) => {
      const friendId =
        message.sender_id === user?.id ? message.receiver_id : message.sender_id;

      setDmMessages((prev) => {
        const existing = prev[friendId] || [];
        if (existing.some((m) => m.id === message.id)) return prev;
        return {
          ...prev,
          [friendId]: [...existing, { ...message, wasPending: Boolean(wasPending) }],
        };
      });
    };

    socket.on('user:status', ({ userId, status }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (status === 'online') next.add(userId);
        else next.delete(userId);
        return next;
      });
      setFriends((prev) =>
        prev.map((f) => (f.id === userId ? { ...f, status } : f))
      );
    });

    const handleVoiceUpdate = ({ channelId, participantCount }) => {
      setVoiceChannelOccupancy((prev) => {
        const next = new Map(prev);
        if (participantCount > 0) next.set(channelId, participantCount);
        else next.delete(channelId);
        return next;
      });
    };

    socket.on('friend:request-received', refreshFriendState);
    socket.on('friend:updated', refreshFriendState);
    socket.on('server:updated', refreshServerState);
    socket.on('server:deleted', handleServerDeleted);
    socket.on('voice:channel:update', handleVoiceUpdate);
    socket.on('dm:new', handleDMNew);

    return () => {
      socket.off('user:status');
      socket.off('friend:request-received', refreshFriendState);
      socket.off('friend:updated', refreshFriendState);
      socket.off('server:updated', refreshServerState);
      socket.off('server:deleted', handleServerDeleted);
      socket.off('voice:channel:update', handleVoiceUpdate);
      socket.off('dm:new', handleDMNew);
    };
  }, [socket, activeView?.id, activeView?.type, serverDetails, user?.id, disconnectOwnServer]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const loadServerDetails = useCallback(async (serverId) => {
    try {
      const serverObj = servers.find((s) => s.id === serverId);
      const serverApi = getApiForServer(serverObj);
      setActiveServerApi(serverApi);

      if (serverObj?.server_url &&
          (serverObj.server_type === 'own' || serverObj.server_type === 'local')) {
        connectToOwnServer(serverObj);
      } else {
        disconnectOwnServer();
      }

      const data = await serverApi.getServer(serverId);
      setServerDetails((prev) => ({ ...prev, [serverId]: data }));
      return data;
    } catch (err) {
      console.error('Failed to load server:', err);
    }
  }, [servers, connectToOwnServer, disconnectOwnServer]);

  const refreshFriends = useCallback(async () => {
    try {
      const [friendsData, pendingData] = await Promise.all([
        api.getFriends(),
        api.getPendingRequests(),
      ]);
      setFriends(friendsData.friends);
      setPendingRequests(pendingData);
    } catch (err) {
      console.error('Failed to refresh friends:', err);
    }
  }, []);

  const refreshServers = useCallback(async () => {
    try {
      const data = await api.getServers();
      setServers(data.servers);
    } catch (err) {
      console.error('Failed to refresh servers:', err);
    }
  }, []);

  const addDMMessage = useCallback((friendId, message) => {
    setDmMessages((prev) => {
      const existing = prev[friendId] || [];
      if (existing.some((m) => m.id === message.id)) return prev;
      return { ...prev, [friendId]: [...existing, message] };
    });
  }, []);

  return (
    <AppContext.Provider
      value={{
        friends, setFriends,
        pendingRequests, setPendingRequests,
        servers, setServers,
        activeView, setActiveView,
        activeChannel, setActiveChannel,
        serverDetails, loadServerDetails,
        onlineUsers,
        voiceChannelOccupancy,
        refreshFriends,
        refreshServers,
        // Multi-server
        activeServerApi,
        ownSocket,
        // DM in-memory store
        dmMessages,
        addDMMessage,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
