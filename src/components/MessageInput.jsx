import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Send, Smile } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export default function MessageInput({ onSend, placeholder, channelId, isDM, targetId }) {
  const { socket } = useSocket();
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  const typingRef = useRef(false);
  const typingTimeoutRef = useRef(null);

  const handleTyping = useCallback(() => {
    if (!socket || !channelId) return;

    if (!typingRef.current) {
      typingRef.current = true;
      socket.emit('typing:start', { channelId, isDM, targetId });
    }

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      typingRef.current = false;
      socket.emit('typing:stop', { channelId, isDM, targetId });
    }, 2000);
  }, [socket, channelId, isDM, targetId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;

    onSend(value.trim());
    setValue('');

    // Stop typing
    typingRef.current = false;
    clearTimeout(typingTimeoutRef.current);
    socket?.emit('typing:stop', { channelId, isDM, targetId });

    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="px-4 pb-4 pt-2">
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 bg-nv-surface/40 rounded-xl border border-nv-border/30 px-3 py-2 focus-within:border-nv-accent/30 focus-within:ring-1 focus-within:ring-nv-accent/15 transition-all duration-200"
      >
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            handleTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className="flex-1 bg-transparent text-sm text-nv-text-primary placeholder-nv-text-tertiary resize-none focus:outline-none max-h-32 leading-relaxed"
          style={{ height: 'auto', minHeight: '24px' }}
          onInput={(e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
          }}
        />
        <motion.button
          type="submit"
          disabled={!value.trim()}
          whileTap={{ scale: 0.9 }}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-nv-accent disabled:text-nv-text-tertiary disabled:opacity-40 hover:bg-nv-accent/10 transition-all shrink-0"
        >
          <Send size={16} />
        </motion.button>
      </form>
    </div>
  );
}
