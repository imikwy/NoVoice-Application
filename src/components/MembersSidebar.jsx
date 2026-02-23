import { motion, AnimatePresence } from 'framer-motion';
import { Crown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { useVoice } from '../context/VoiceContext';
import UserAvatar from './UserAvatar';

export default function MembersSidebar({ isOpen }) {
  const { user } = useAuth();
  const { activeView, serverDetails, onlineUsers } = useApp();
  const { voiceParticipants, activeVoiceChannelId } = useVoice();

  const serverId = activeView?.id;
  const details = serverDetails[serverId];
  const server = details?.server;
  const members = details?.members || [];

  const voiceParticipantIds = new Set(voiceParticipants.map((p) => p.id));

  // Split into owner and regular members
  const owner = members.find((m) => m.id === server?.owner_id);
  const regularMembers = members.filter((m) => m.id !== server?.owner_id);

  const getMemberColor = (member) => {
    if (member.id === server?.owner_id) return 'text-nv-danger';
    if (member.id === user?.id) return 'text-nv-accent';
    return 'text-nv-text-secondary';
  };

  const renderMember = (member) => {
    const isOnline = onlineUsers.has(member.id) || member.status === 'online';
    const inVoice = voiceParticipantIds.has(member.id);
    const isMe = member.id === user?.id;
    const isOwner = member.id === server?.owner_id;

    return (
      <motion.div
        key={member.id}
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors cursor-default ${
          isMe ? 'bg-nv-accent/[0.06]' : 'hover:bg-white/[0.03]'
        }`}
      >
        <UserAvatar user={member} size="xs" showStatus isOnline={isOnline} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span
              className={`text-xs font-medium truncate ${getMemberColor(member)}`}
            >
              {member.display_name}
              {isMe && ' (you)'}
            </span>
            {isOwner && (
              <Crown size={10} className="text-nv-danger shrink-0" />
            )}
          </div>
          {inVoice && (
            <span className="text-[10px] text-nv-accent/70 font-medium">
              In Voice
            </span>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 200, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          className="h-full bg-nv-channels border-l border-white/[0.04] flex flex-col shrink-0 overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/[0.04] shrink-0">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-nv-text-tertiary">
              Members — {members.length}
            </h3>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5">
            {/* Admin section */}
            {owner && (
              <>
                <div className="px-3 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-nv-danger/60">
                    Admin
                  </span>
                </div>
                {renderMember(owner)}
                <div className="h-2" />
              </>
            )}

            {/* Members section */}
            {regularMembers.length > 0 && (
              <>
                <div className="px-3 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-nv-text-tertiary">
                    Members — {regularMembers.length}
                  </span>
                </div>
                {regularMembers.map(renderMember)}
              </>
            )}

            {members.length === 0 && (
              <p className="text-xs text-nv-text-tertiary px-3 py-4 text-center">
                No members
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
