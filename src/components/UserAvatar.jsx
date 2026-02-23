import { motion } from 'framer-motion';

export default function UserAvatar({ user, size = 'md', showStatus = false, isOnline = false }) {
  const sizes = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
  };

  const statusSizes = {
    xs: 'w-2 h-2 border',
    sm: 'w-2.5 h-2.5 border-[1.5px]',
    md: 'w-3 h-3 border-2',
    lg: 'w-3.5 h-3.5 border-2',
    xl: 'w-4 h-4 border-2',
  };

  const initials = (user?.display_name || user?.username || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={`${sizes[size]} rounded-full flex items-center justify-center font-semibold text-white`}
        style={{ backgroundColor: user?.avatar_color || '#636366' }}
      >
        {initials}
      </div>
      {showStatus && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={`absolute -bottom-0.5 -right-0.5 ${statusSizes[size]} rounded-full border-nv-sidebar ${
            isOnline ? 'bg-nv-accent' : 'bg-nv-text-tertiary'
          }`}
        />
      )}
    </div>
  );
}
