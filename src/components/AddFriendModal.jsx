import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Loader2, Check } from 'lucide-react';
import Modal from './Modal';
import api from '../utils/api';
import { useApp } from '../context/AppContext';

export default function AddFriendModal({ isOpen, onClose }) {
  const { refreshFriends } = useApp();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const data = await api.addFriend(username.trim());
      setSuccess(`Friend request sent to ${data.friend.display_name}`);
      setUsername('');
      await refreshFriends();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setUsername('');
    setError('');
    setSuccess('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Friend">
      <p className="text-sm text-nv-text-secondary mb-4">
        Enter a username to send a friend request.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError('');
              setSuccess('');
            }}
            className="nv-input"
            autoFocus
          />
          <UserPlus
            size={16}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-nv-text-tertiary"
          />
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.p
              key="error"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-nv-danger text-xs font-medium"
            >
              {error}
            </motion.p>
          )}
          {success && (
            <motion.p
              key="success"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-nv-accent text-xs font-medium flex items-center gap-1"
            >
              <Check size={14} />
              {success}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={handleClose} className="nv-button-ghost">
            Cancel
          </button>
          <motion.button
            type="submit"
            disabled={loading || !username.trim()}
            whileTap={{ scale: 0.97 }}
            className="nv-button-primary disabled:opacity-40"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Send Request'}
          </motion.button>
        </div>
      </form>
    </Modal>
  );
}
