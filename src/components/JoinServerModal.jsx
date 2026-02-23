import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, LogIn } from 'lucide-react';
import Modal from './Modal';
import api from '../utils/api';
import { useApp } from '../context/AppContext';
import { useSocket } from '../context/SocketContext';

export default function JoinServerModal({ isOpen, onClose }) {
  const { refreshServers, setActiveView, loadServerDetails } = useApp();
  const { socket } = useSocket();
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    setError('');
    setLoading(true);

    try {
      const data = await api.joinServer(inviteCode.trim());
      await refreshServers();
      await loadServerDetails(data.server.id);
      setActiveView({ type: 'server', id: data.server.id, data: data.server });
      socket?.emit('server:subscribe', { serverId: data.server.id });
      setInviteCode('');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setInviteCode('');
    setError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Join Server">
      <p className="text-sm text-nv-text-secondary mb-4">
        Enter an invite code to join an existing server.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Invite code"
          value={inviteCode}
          onChange={(e) => {
            setInviteCode(e.target.value);
            setError('');
          }}
          className="nv-input text-center tracking-widest font-mono"
          autoFocus
        />

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-nv-danger text-xs font-medium"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={handleClose} className="nv-button-ghost">
            Cancel
          </button>
          <motion.button
            type="submit"
            disabled={loading || !inviteCode.trim()}
            whileTap={{ scale: 0.97 }}
            className="nv-button-primary disabled:opacity-40 flex items-center gap-2"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <LogIn size={14} />
                Join
              </>
            )}
          </motion.button>
        </div>
      </form>
    </Modal>
  );
}
