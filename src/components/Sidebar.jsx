import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Server,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  LogOut,
  LogIn,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import UserAvatar from './UserAvatar';
import VoiceBar from './VoiceBar';

export default function Sidebar({
  onAddFriend,
  onCreateServer,
  onJoinServer,
  collapsed = false,
  onToggleCollapse,
}) {
  const { user, logout } = useAuth();
  const {
    friends,
    servers,
    activeView,
    setActiveView,
    setActiveChannel,
    onlineUsers,
    pendingRequests,
  } = useApp();

  const [friendsOpen, setFriendsOpen] = useState(true);
  const [serversOpen, setServersOpen] = useState(true);

  const handleFriendClick = (friend) => {
    setActiveView({ type: 'friend', id: friend.id, data: friend });
    setActiveChannel(null);
  };

  const handleServerClick = (server) => {
    setActiveView({ type: 'server', id: server.id, data: server });
    setActiveChannel(null);
  };

  return (
    <motion.div
      layout
      className={`h-full bg-nv-sidebar flex flex-col shrink-0 transition-all duration-300 ease-out ${
        collapsed ? 'w-[68px]' : 'w-[240px]'
      }`}
    >
      {/* Top bar area */}
      <div className={`px-3 pt-3 pb-2 ${collapsed ? 'flex justify-center' : 'flex items-center justify-between'}`}>
        {!collapsed && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-nv-text-tertiary uppercase tracking-wider px-2">
              Navigation
            </span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/10 transition-all"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {/* Friends Section */}
        <div>
          <button
            onClick={() => setFriendsOpen(!friendsOpen)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.04] transition-all duration-150 group"
          >
            <motion.div
              animate={{ rotate: friendsOpen ? 0 : -90 }}
              transition={{ duration: 0.15 }}
            >
              <ChevronDown size={14} className="text-nv-text-tertiary" />
            </motion.div>
            <Users size={15} />
            {!collapsed && (
              <>
                <span className="text-xs font-semibold uppercase tracking-wider flex-1 text-left">
                  Friends
                </span>
                {pendingRequests.incoming.length > 0 && (
                  <span className="w-5 h-5 rounded-full bg-nv-accent text-[10px] font-bold flex items-center justify-center text-white">
                    {pendingRequests.incoming.length}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddFriend();
                  }}
                  className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
                >
                  <Plus size={12} />
                </button>
              </>
            )}
          </button>

          <AnimatePresence>
            {friendsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {/* Pending requests */}
                {pendingRequests.incoming.length > 0 && !collapsed && (
                  <button
                    onClick={() =>
                      setActiveView({ type: 'pending', id: 'pending', data: null })
                    }
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-150 ${
                      activeView?.type === 'pending'
                        ? 'bg-white/[0.08] text-nv-text-primary'
                        : 'text-nv-text-secondary hover:bg-white/[0.04] hover:text-nv-text-primary'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-nv-warning/10 flex items-center justify-center shrink-0">
                      <Users size={14} className="text-nv-warning" />
                    </div>
                    <span className="text-sm truncate">Pending</span>
                    <span className="ml-auto w-5 h-5 rounded-full bg-nv-warning text-[10px] font-bold flex items-center justify-center text-white">
                      {pendingRequests.incoming.length}
                    </span>
                  </button>
                )}

                {friends.map((friend) => (
                  <button
                    key={friend.id}
                    onClick={() => handleFriendClick(friend)}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-150 ${
                      activeView?.type === 'friend' && activeView?.id === friend.id
                        ? 'bg-white/[0.08] text-nv-text-primary'
                        : 'text-nv-text-secondary hover:bg-white/[0.04] hover:text-nv-text-primary'
                    }`}
                  >
                    <UserAvatar
                      user={friend}
                      size="sm"
                      showStatus
                      isOnline={onlineUsers.has(friend.id) || friend.status === 'online'}
                    />
                    {!collapsed && (
                      <span className="text-sm truncate">{friend.display_name}</span>
                    )}
                  </button>
                ))}

                {friends.length === 0 && !collapsed && (
                  <p className="text-xs text-nv-text-tertiary px-3 py-2">
                    No friends yet
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Spacer */}
        <div className="h-1" />

        {/* Servers Section */}
        <div>
          <button
            onClick={() => setServersOpen(!serversOpen)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.04] transition-all duration-150 group"
          >
            <motion.div
              animate={{ rotate: serversOpen ? 0 : -90 }}
              transition={{ duration: 0.15 }}
            >
              <ChevronDown size={14} className="text-nv-text-tertiary" />
            </motion.div>
            <Server size={15} />
            {!collapsed && (
              <>
                <span className="text-xs font-semibold uppercase tracking-wider flex-1 text-left">
                  Servers
                </span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateServer();
                    }}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 transition-all"
                    title="Create Server"
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onJoinServer();
                    }}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 transition-all"
                    title="Join Server"
                  >
                    <LogIn size={12} />
                  </button>
                </div>
              </>
            )}
          </button>

          <AnimatePresence>
            {serversOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {servers.map((server) => (
                  <button
                    key={server.id}
                    onClick={() => handleServerClick(server)}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-150 ${
                      activeView?.type === 'server' && activeView?.id === server.id
                        ? 'bg-white/[0.08] text-nv-text-primary'
                        : 'text-nv-text-secondary hover:bg-white/[0.04] hover:text-nv-text-primary'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: server.icon_color }}
                    >
                      {server.name[0].toUpperCase()}
                    </div>
                    {!collapsed && (
                      <span className="text-sm truncate">{server.name}</span>
                    )}
                  </button>
                ))}

                {servers.length === 0 && !collapsed && (
                  <p className="text-xs text-nv-text-tertiary px-3 py-2">
                    No servers yet
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Voice bar — shows when user is in a voice channel */}
      <VoiceBar collapsed={collapsed} />

      {/* User bar at bottom */}
      <div className="border-t border-white/[0.04] p-2">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
          <UserAvatar user={user} size="sm" showStatus isOnline />
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-nv-text-primary truncate">
                  {user?.display_name}
                </p>
                <p className="text-[10px] text-nv-text-tertiary truncate">
                  @{user?.username}
                </p>
              </div>
              <button
                onClick={logout}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-danger hover:bg-nv-danger/10 transition-all"
                title="Logout"
              >
                <LogOut size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
