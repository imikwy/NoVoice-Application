import { motion } from 'framer-motion';
import { Users, Server, MessageCircle } from 'lucide-react';

export default function EmptyState({ onAddFriend, onCreateServer, onJoinServer }) {
  return (
    <div className="h-full flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md mx-auto px-8"
      >
        {/* Icon cluster */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <motion.div
            initial={{ scale: 0, rotate: -15 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="w-14 h-14 rounded-2xl bg-nv-blue/10 flex items-center justify-center"
          >
            <MessageCircle size={24} className="text-nv-blue" />
          </motion.div>
          <motion.div
            initial={{ scale: 0, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
            className="w-16 h-16 rounded-2xl bg-nv-accent/10 flex items-center justify-center"
          >
            <Users size={28} className="text-nv-accent" />
          </motion.div>
          <motion.div
            initial={{ scale: 0, rotate: 15 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
            className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center"
          >
            <Server size={24} className="text-purple-400" />
          </motion.div>
        </div>

        <h2 className="text-xl font-semibold text-nv-text-primary mb-2">
          Welcome to NoVoice
        </h2>
        <p className="text-sm text-nv-text-secondary leading-relaxed mb-8">
          Start by adding friends or creating a server. Your conversations will appear here.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onAddFriend}
            className="nv-button-primary w-full sm:w-auto flex items-center justify-center gap-2"
          >
            <Users size={16} />
            Add Friend
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onCreateServer}
            className="nv-button-secondary w-full sm:w-auto flex items-center justify-center gap-2"
          >
            <Server size={16} />
            Create Server
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onJoinServer}
            className="nv-button-ghost w-full sm:w-auto flex items-center justify-center gap-2"
          >
            Join Server
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
