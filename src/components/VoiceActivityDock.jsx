import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

function pickPreferredModuleId(modules) {
  if (!Array.isArray(modules) || modules.length === 0) return null;

  const prioritized = [...modules].sort(
    (a, b) => Number(b.autoExpandPriority || 0) - Number(a.autoExpandPriority || 0)
  );

  const highlighted = prioritized.find((module) => Number(module.autoExpandPriority || 0) > 0);
  if (highlighted) return highlighted.id;

  const defaultModule = prioritized.find((module) => module.defaultExpanded);
  if (defaultModule) return defaultModule.id;

  return prioritized[0].id;
}

export default function VoiceActivityDock({
  modules = [],
  showModuleButtons = false,
}) {
  const enabledModules = useMemo(
    () => modules.filter((module) => module?.enabled !== false && module?.panel),
    [modules]
  );

  const [activeModuleId, setActiveModuleId] = useState(() => pickPreferredModuleId(enabledModules));

  useEffect(() => {
    if (enabledModules.length === 0) {
      setActiveModuleId(null);
      return;
    }

    const hasActive = enabledModules.some((module) => module.id === activeModuleId);
    if (!hasActive) {
      setActiveModuleId(pickPreferredModuleId(enabledModules));
      return;
    }

    if (showModuleButtons) return;
    const preferredId = pickPreferredModuleId(enabledModules);
    if (preferredId && preferredId !== activeModuleId) {
      setActiveModuleId(preferredId);
    }
  }, [enabledModules, activeModuleId, showModuleButtons]);

  const activeModule = enabledModules.find((module) => module.id === activeModuleId) || null;

  return (
    <div className="shrink-0 border-t border-white/[0.05] bg-nv-surface/[0.04]">
      <AnimatePresence initial={false}>
        {activeModule && (
          <motion.div
            key={activeModule.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.16 }}
          >
            {activeModule.panel}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="h-11 px-4 border-t border-white/[0.05] bg-gradient-to-r from-white/[0.02] via-transparent to-white/[0.02] flex items-center">
        <span className="text-[10px] uppercase tracking-[0.22em] text-nv-text-tertiary font-semibold">
          Voice Apps
        </span>
        <span className="ml-3 text-xs text-nv-text-secondary truncate">
          {activeModule ? activeModule.label : 'No module active'}
        </span>
        {activeModule?.subtitle && (
          <span className="ml-2 text-[10px] text-nv-text-tertiary truncate">
            {activeModule.subtitle}
          </span>
        )}
        <span className="ml-auto text-[10px] text-nv-text-tertiary">
          {enabledModules.length} loaded
        </span>
      </div>
    </div>
  );
}
