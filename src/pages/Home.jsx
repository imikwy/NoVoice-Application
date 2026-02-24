import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import Sidebar from '../components/Sidebar';
import ServerChannels from '../components/ServerChannels';
import ChatArea from '../components/ChatArea';
import EmptyState from '../components/EmptyState';
import PendingRequests from '../components/PendingRequests';
import MembersSidebar from '../components/MembersSidebar';
import AddFriendModal from '../components/AddFriendModal';
import CreateServerModal from '../components/CreateServerModal';
import JoinServerModal from '../components/JoinServerModal';
import AppStoreView from '../components/AppStoreView';
import AppView from '../components/AppView';

export default function Home() {
  const { activeView, activeChannel, friends, servers } = useApp();

  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [showJoinServer, setShowJoinServer] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMemberList, setShowMemberList] = useState(true);

  const isServerView = activeView?.type === 'server';
  const isDMView = activeView?.type === 'friend';
  const isPendingView = activeView?.type === 'pending';
  const isAppStoreView = activeView?.type === 'appstore';
  const isAppView = activeView?.type === 'app';
  const hasContent = activeView !== null;
  const isEmpty = friends.length === 0 && servers.length === 0 && !hasContent;

  useEffect(() => {
    setSidebarCollapsed(isServerView);
  }, [isServerView]);

  // Reset member list visibility when entering a server
  useEffect(() => {
    if (isServerView) setShowMemberList(true);
  }, [activeView?.id]);

  const showMembers = isServerView && showMemberList;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main sidebar */}
      <Sidebar
        onAddFriend={() => setShowAddFriend(true)}
        onCreateServer={() => setShowCreateServer(true)}
        onJoinServer={() => setShowJoinServer(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      {/* Server channels sidebar */}
      <AnimatePresence>
        {isServerView && <ServerChannels />}
      </AnimatePresence>

      {/* Main content */}
      {isAppStoreView ? (
        <AppStoreView />
      ) : isAppView ? (
        <AppView />
      ) : isPendingView ? (
        <PendingRequests />
      ) : hasContent && (isDMView || (isServerView && activeChannel)) ? (
        <ChatArea
          showMembers={showMembers}
          onToggleMembers={isServerView ? () => setShowMemberList((p) => !p) : undefined}
        />
      ) : isServerView && !activeChannel ? (
        <div className="flex-1 bg-nv-content flex items-center justify-center">
          <p className="text-sm text-nv-text-tertiary">Select a channel</p>
        </div>
      ) : (
        <div className="flex-1 bg-nv-content">
          <EmptyState
            onAddFriend={() => setShowAddFriend(true)}
            onCreateServer={() => setShowCreateServer(true)}
            onJoinServer={() => setShowJoinServer(true)}
          />
        </div>
      )}

      {/* Members sidebar */}
      <MembersSidebar isOpen={showMembers} />

      {/* Modals */}
      <AddFriendModal isOpen={showAddFriend} onClose={() => setShowAddFriend(false)} />
      <CreateServerModal isOpen={showCreateServer} onClose={() => setShowCreateServer(false)} />
      <JoinServerModal isOpen={showJoinServer} onClose={() => setShowJoinServer(false)} />
    </div>
  );
}
