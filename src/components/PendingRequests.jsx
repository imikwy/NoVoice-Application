import { motion } from 'framer-motion';
import { Check, X, Clock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import api from '../utils/api';
import UserAvatar from './UserAvatar';

export default function PendingRequests() {
  const { pendingRequests, refreshFriends } = useApp();

  const handleAccept = async (requestId) => {
    try {
      await api.acceptFriend(requestId);
      await refreshFriends();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDecline = async (friendId) => {
    try {
      await api.removeFriend(friendId);
      await refreshFriends();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 bg-nv-content flex flex-col">
      <div className="h-12 flex items-center px-4 border-b border-white/[0.04] shrink-0">
        <Clock size={16} className="text-nv-warning mr-2" />
        <span className="text-sm font-semibold text-nv-text-primary">
          Pending Requests
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Incoming */}
        {pendingRequests.incoming.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-nv-text-tertiary uppercase tracking-wider mb-3 px-1">
              Incoming — {pendingRequests.incoming.length}
            </h3>
            <div className="space-y-1">
              {pendingRequests.incoming.map((req) => (
                <motion.div
                  key={req.request_id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-nv-surface/20 border border-nv-border/10"
                >
                  <UserAvatar user={req} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-nv-text-primary">
                      {req.display_name}
                    </p>
                    <p className="text-xs text-nv-text-tertiary">@{req.username}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleAccept(req.request_id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-nv-accent/10 text-nv-accent hover:bg-nv-accent/20 transition-all"
                    >
                      <Check size={16} />
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleDecline(req.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-nv-danger/10 text-nv-danger hover:bg-nv-danger/20 transition-all"
                    >
                      <X size={16} />
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Outgoing */}
        {pendingRequests.outgoing.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-nv-text-tertiary uppercase tracking-wider mb-3 px-1">
              Outgoing — {pendingRequests.outgoing.length}
            </h3>
            <div className="space-y-1">
              {pendingRequests.outgoing.map((req) => (
                <motion.div
                  key={req.request_id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-nv-surface/20 border border-nv-border/10"
                >
                  <UserAvatar user={req} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-nv-text-primary">
                      {req.display_name}
                    </p>
                    <p className="text-xs text-nv-text-tertiary">@{req.username}</p>
                  </div>
                  <span className="text-xs text-nv-text-tertiary px-2 py-1 rounded-lg bg-nv-surface/30">
                    Pending
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {pendingRequests.incoming.length === 0 &&
          pendingRequests.outgoing.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <Clock size={36} className="text-nv-text-tertiary mb-3" />
              <p className="text-sm text-nv-text-secondary">No pending requests</p>
            </div>
          )}
      </div>
    </div>
  );
}
