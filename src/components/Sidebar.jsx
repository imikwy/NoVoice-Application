import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Server, ChevronDown, ChevronLeft, ChevronRight,
  Plus, LogOut, LogIn, LayoutGrid, Store, Pin, PinOff,
  Eye, EyeOff, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import UserAvatar from './UserAvatar';
import VoiceBar from './VoiceBar';

// ── Tiny context-menu hook ────────────────────────────────────────────────────

function useContextMenu() {
  const [menu, setMenu] = useState(null); // { x, y, items }
  const ref = useRef(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  const open = useCallback((e, items) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  return { menu, setMenu, open, ref };
}

function ContextMenu({ menu, onClose }) {
  if (!menu) return null;
  return (
    <div
      style={{ position: 'fixed', top: menu.y, left: menu.x, zIndex: 9999 }}
      className="bg-nv-sidebar border border-white/[0.1] rounded-xl shadow-2xl py-1 min-w-[160px] backdrop-blur"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {menu.items.map((item, i) =>
        item.divider ? (
          <div key={i} className="h-px bg-white/[0.06] my-1" />
        ) : (
          <button
            key={i}
            onClick={() => { item.action(); onClose(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors hover:bg-white/[0.08] ${item.danger ? 'text-red-400 hover:text-red-300' : 'text-nv-text-secondary hover:text-nv-text-primary'
              }`}
          >
            {item.icon && <span className="opacity-70">{item.icon}</span>}
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

// ── Section header with hide/show and context menu ────────────────────────────

function SectionHeader({ sectionKey, label, icon: Icon, hidden, onToggleHide, children, collapsed }) {
  const { menu, setMenu, open } = useContextMenu();
  const [isOpen, setIsOpen] = useState(!hidden);

  // Sync with hidden prop
  useEffect(() => { if (hidden) setIsOpen(false); }, [hidden]);

  const contextItems = [
    {
      icon: hidden ? <Eye size={13} /> : <EyeOff size={13} />,
      label: hidden ? 'Show section' : 'Hide section',
      action: onToggleHide,
    },
  ];

  if (hidden) {
    // Collapsed pill shown so user can re-enable
    return (
      <div className="relative">
        <button
          onContextMenu={(e) => open(e, contextItems)}
          onClick={onToggleHide}
          title={`Show ${label}`}
          className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-nv-text-tertiary/40 hover:text-nv-text-tertiary transition-all group"
        >
          <Icon size={13} />
          {!collapsed && <span className="text-[10px] font-semibold uppercase tracking-wider flex-1 text-left line-through">{label}</span>}
          {!collapsed && <Eye size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />}
        </button>
        <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        onContextMenu={(e) => open(e, contextItems)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.04] transition-all duration-150 group"
      >
        <motion.div animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.15 }}>
          <ChevronDown size={14} className="text-nv-text-tertiary" />
        </motion.div>
        <Icon size={15} />
        {!collapsed && (
          <>
            <span className="text-xs font-semibold uppercase tracking-wider flex-1 text-left">{label}</span>
            {children}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleHide(); }}
              className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
              title={`Hide ${label}`}
            >
              <EyeOff size={11} />
            </button>
          </>
        )}
      </button>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* slot for children rendered by parent */}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── App sidebar item with hover unpin ─────────────────────────────────────────

function AppSidebarItem({ app, isActive, isExtension, onClick, onUnpin, onOpen, collapsed }) {
  const { menu, setMenu, open } = useContextMenu();

  const contextItems = [
    { icon: <Pin size={13} />, label: 'Open', action: onClick },
    { divider: true },
    {
      icon: <PinOff size={13} />,
      label: 'Unpin from sidebar',
      action: onUnpin,
      danger: false,
    },
  ];

  return (
    <div className="relative group/app">
      <button
        onClick={onClick}
        onContextMenu={(e) => open(e, contextItems)}
        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-150 ${isActive
            ? 'bg-white/[0.08] text-nv-text-primary'
            : 'text-nv-text-secondary hover:bg-white/[0.04] hover:text-nv-text-primary'
          }`}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 border border-white/[0.05]"
          style={{ backgroundColor: app.iconColor ? `${app.iconColor}20` : 'rgba(255,255,255,0.05)' }}
        >
          {app.icon}
        </div>
        {!collapsed && <span className="text-sm truncate flex-1 text-left">{app.name}</span>}

        {/* Inline unpin button (hover only, non-collapsed) */}
        {!collapsed && (
          <button
            onClick={(e) => { e.stopPropagation(); onUnpin(); }}
            className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover/app:opacity-100 hover:bg-white/10 text-nv-text-tertiary hover:text-red-400 transition-all shrink-0"
            title="Unpin from sidebar"
          >
            <PinOff size={11} />
          </button>
        )}
      </button>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

export default function Sidebar({
  onAddFriend,
  onCreateServer,
  onJoinServer,
  collapsed = false,
  onToggleCollapse,
}) {
  const { user, logout } = useAuth();
  const {
    friends, servers, activeView, setActiveView, setActiveChannel,
    onlineUsers, pendingRequests,
    pinnedApps, unpinApp, installedExtensions, uninstallExtension,
    hiddenSections, hideSection, showSection,
  } = useApp();

  const [appsOpen, setAppsOpen] = useState(true);
  const [friendsOpen, setFriendsOpen] = useState(true);
  const [serversOpen, setServersOpen] = useState(true);
  const [hiddenPanelOpen, setHiddenPanelOpen] = useState(false);

  const appsHidden = hiddenSections.has('apps');
  const friendsHidden = hiddenSections.has('friends');
  const serversHidden = hiddenSections.has('servers');

  const hiddenCount = [appsHidden, friendsHidden, serversHidden].filter(Boolean).length;

  // Auto-close panel when no more hidden sections
  useEffect(() => {
    if (hiddenCount === 0) setHiddenPanelOpen(false);
  }, [hiddenCount]);

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
      className={`h-full bg-nv-sidebar flex flex-col shrink-0 transition-all duration-300 ease-out ${collapsed ? 'w-[68px]' : 'w-[240px]'
        }`}
    >
      {/* Top bar */}
      <div className={`px-3 pt-3 pb-2 ${collapsed ? 'flex justify-center' : 'flex items-center justify-between'}`}>
        {!collapsed && (
          <span className="text-xs font-semibold text-nv-text-tertiary uppercase tracking-wider px-2">
            Navigation
          </span>
        )}
        <div className="flex items-center gap-1">
          {/* Restore hidden sections button — only when expanded and something is hidden */}
          {!collapsed && hiddenCount > 0 && (
            <button
              onClick={() => setHiddenPanelOpen((v) => !v)}
              className="relative w-7 h-7 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/10 transition-all"
              title="Restore hidden sections"
            >
              <EyeOff size={13} />
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-nv-accent text-[8px] font-bold flex items-center justify-center text-white leading-none">
                {hiddenCount}
              </span>
            </button>
          )}
          <button
            onClick={onToggleCollapse}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/10 transition-all"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </div>

      {/* Hidden sections restore panel */}
      <AnimatePresence>
        {!collapsed && hiddenPanelOpen && hiddenCount > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden mx-3 mb-1"
          >
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-1.5 space-y-0.5">
              <p className="text-[10px] font-semibold text-nv-text-tertiary uppercase tracking-wider px-1.5 pt-0.5 pb-1">
                Hidden
              </p>
              {appsHidden && (
                <button
                  onClick={() => showSection('apps')}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all"
                >
                  <LayoutGrid size={13} />
                  <span className="text-xs flex-1 text-left">Apps</span>
                  <Eye size={11} className="text-nv-text-tertiary" />
                </button>
              )}
              {friendsHidden && (
                <button
                  onClick={() => showSection('friends')}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all"
                >
                  <Users size={13} />
                  <span className="text-xs flex-1 text-left">Friends</span>
                  <Eye size={11} className="text-nv-text-tertiary" />
                </button>
              )}
              {serversHidden && (
                <button
                  onClick={() => showSection('servers')}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all"
                >
                  <Server size={13} />
                  <span className="text-xs flex-1 text-left">Servers</span>
                  <Eye size={11} className="text-nv-text-tertiary" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">

        {/* ── Apps Section ── */}
        {!appsHidden && (
          <div>
            <div className="relative group/aps">
              <button
                onClick={() => setAppsOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-150 group text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.04]"
              >
                <motion.div animate={{ rotate: appsOpen ? 0 : -90 }} transition={{ duration: 0.15 }}>
                  <ChevronDown size={14} className="text-nv-text-tertiary" />
                </motion.div>
                <LayoutGrid size={15} />
                {!collapsed && (
                  <>
                    <span className="text-xs font-semibold uppercase tracking-wider flex-1 text-left">Apps</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setActiveView({ type: 'appstore' }); setActiveChannel(null); }}
                      className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
                      title="Browse App Store"
                    >
                      <Store size={11} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); hideSection('apps'); }}
                      className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
                      title="Hide Apps"
                    >
                      <EyeOff size={11} />
                    </button>
                  </>
                )}
              </button>
            </div>

            <AnimatePresence>
              {appsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <button
                    onClick={() => { setActiveView({ type: 'appstore' }); setActiveChannel(null); }}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-150 ${activeView?.type === 'appstore'
                        ? 'bg-white/[0.08] text-nv-text-primary'
                        : 'text-nv-text-secondary hover:bg-white/[0.04] hover:text-nv-text-primary'
                      }`}
                  >
                    <div className="w-8 h-8 rounded-xl bg-nv-accent/10 flex items-center justify-center shrink-0">
                      <Store size={14} className="text-nv-accent" />
                    </div>
                    {!collapsed && <span className="text-sm truncate">App Store</span>}
                  </button>

                  {pinnedApps.map((app) => (
                    <AppSidebarItem
                      key={app.id}
                      app={app}
                      isActive={activeView?.type === 'app' && activeView?.id === app.id}
                      onClick={() => { setActiveView({ type: 'app', id: app.id }); setActiveChannel(null); }}
                      onUnpin={() => unpinApp(app.id)}
                      collapsed={collapsed}
                    />
                  ))}

                  {installedExtensions.map((ext) => (
                    <AppSidebarItem
                      key={ext.id}
                      app={ext}
                      isExtension
                      isActive={activeView?.type === 'app' && activeView?.id === ext.id}
                      onClick={() => { setActiveView({ type: 'app', id: ext.id }); setActiveChannel(null); }}
                      onUnpin={() => uninstallExtension(ext.id)}
                      collapsed={collapsed}
                    />
                  ))}

                  {pinnedApps.length === 0 && installedExtensions.length === 0 && !collapsed && (
                    <p className="text-xs text-nv-text-tertiary px-3 py-2">No apps pinned yet</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {!appsHidden && <div className="h-1" />}

        {/* ── Friends Section ── */}
        {!friendsHidden && (
          <div>
            <div className="relative group/frd">
              <button
                onClick={() => setFriendsOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-150 group text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.04]"
              >
                <motion.div animate={{ rotate: friendsOpen ? 0 : -90 }} transition={{ duration: 0.15 }}>
                  <ChevronDown size={14} className="text-nv-text-tertiary" />
                </motion.div>
                <Users size={15} />
                {!collapsed && (
                  <>
                    <span className="text-xs font-semibold uppercase tracking-wider flex-1 text-left">Friends</span>
                    {pendingRequests.incoming.length > 0 && (
                      <span className="w-5 h-5 rounded-full bg-nv-accent text-[10px] font-bold flex items-center justify-center text-white">
                        {pendingRequests.incoming.length}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onAddFriend(); }}
                      className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
                    >
                      <Plus size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); hideSection('friends'); }}
                      className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
                      title="Hide Friends"
                    >
                      <EyeOff size={11} />
                    </button>
                  </>
                )}
              </button>
            </div>

            <AnimatePresence>
              {friendsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  {pendingRequests.incoming.length > 0 && !collapsed && (
                    <button
                      onClick={() => setActiveView({ type: 'pending', id: 'pending', data: null })}
                      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-150 ${activeView?.type === 'pending'
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
                      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-150 ${activeView?.type === 'friend' && activeView?.id === friend.id
                          ? 'bg-white/[0.08] text-nv-text-primary'
                          : 'text-nv-text-secondary hover:bg-white/[0.04] hover:text-nv-text-primary'
                        }`}
                    >
                      <UserAvatar user={friend} size="sm" showStatus isOnline={onlineUsers.has(friend.id) || friend.status === 'online'} />
                      {!collapsed && <span className="text-sm truncate">{friend.display_name}</span>}
                    </button>
                  ))}

                  {friends.length === 0 && !collapsed && (
                    <p className="text-xs text-nv-text-tertiary px-3 py-2">No friends yet</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {!friendsHidden && <div className="h-1" />}

        {/* ── Servers Section ── */}
        {!serversHidden && (
          <div>
            <div className="relative group/srv">
              <button
                onClick={() => setServersOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-150 group text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.04]"
              >
                <motion.div animate={{ rotate: serversOpen ? 0 : -90 }} transition={{ duration: 0.15 }}>
                  <ChevronDown size={14} className="text-nv-text-tertiary" />
                </motion.div>
                <Server size={15} />
                {!collapsed && (
                  <>
                    <span className="text-xs font-semibold uppercase tracking-wider flex-1 text-left">Servers</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={(e) => { e.stopPropagation(); onCreateServer(); }} className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 transition-all" title="Create Server">
                        <Plus size={12} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onJoinServer(); }} className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 transition-all" title="Join Server">
                        <LogIn size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); hideSection('servers'); }}
                        className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 transition-all"
                        title="Hide Servers"
                      >
                        <EyeOff size={11} />
                      </button>
                    </div>
                  </>
                )}
              </button>
            </div>

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
                      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-150 ${activeView?.type === 'server' && activeView?.id === server.id
                          ? 'bg-white/[0.08] text-nv-text-primary'
                          : 'text-nv-text-secondary hover:bg-white/[0.04] hover:text-nv-text-primary'
                        }`}
                    >
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: server.icon_color }}>
                        {server.name[0].toUpperCase()}
                      </div>
                      {!collapsed && <span className="text-sm truncate">{server.name}</span>}
                    </button>
                  ))}

                  {servers.length === 0 && !collapsed && (
                    <p className="text-xs text-nv-text-tertiary px-3 py-2">No servers yet</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Voice bar */}
      <VoiceBar collapsed={collapsed} />

      {/* User bar */}
      <div className="border-t border-white/[0.04] p-2">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
          <UserAvatar user={user} size="sm" showStatus isOnline />
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-nv-text-primary truncate">{user?.display_name}</p>
                <p className="text-[10px] text-nv-text-tertiary truncate">@{user?.username}</p>
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
