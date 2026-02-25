import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp } from 'lucide-react';

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
}) {
  const enabledModules = useMemo(
    () => modules.filter((module) => module?.enabled !== false && module?.panel),
    [modules]
  );

  const [activeModuleId, setActiveModuleId] = useState(() => pickPreferredModuleId(enabledModules));
  const [isPanelOpen, setIsPanelOpen] = useState(() => Boolean(pickPreferredModuleId(enabledModules)));

  useEffect(() => {
    if (enabledModules.length === 0) {
      setActiveModuleId(null);
      setIsPanelOpen(false);
      return;
    }

    const hasActive = enabledModules.some((module) => module.id === activeModuleId);
    if (!hasActive) {
      const preferredId = pickPreferredModuleId(enabledModules);
      setActiveModuleId(preferredId);
      setIsPanelOpen(Boolean(preferredId));
      return;
    }
  }, [enabledModules, activeModuleId]);

  const activeModule = enabledModules.find((module) => module.id === activeModuleId) || null;

  return (
    <div className="shrink-0 border-t border-white/[0.05] bg-nv-surface/[0.04]">
      <AnimatePresence initial={false}>
        {activeModule && isPanelOpen && (
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

      <div className="h-11 px-4 border-t border-white/[0.05] bg-gradient-to-r from-white/[0.02] via-transparent to-white/[0.02] flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.22em] text-nv-text-tertiary font-semibold">
          Apps
        </span>
        <div className="ml-auto flex items-center gap-2">
          {enabledModules.map((module) => {
            const isActive = module.id === activeModuleId;
            const isRunning = Boolean(module.isRunning);
            const isExpanded = isActive && isPanelOpen;

            return (
              <button
                key={module.id}
                onClick={() => {
                  if (!isActive) {
                    setActiveModuleId(module.id);
                    setIsPanelOpen(true);
                    return;
                  }
                  setIsPanelOpen((prev) => !prev);
                }}
                className={`h-7 inline-flex items-center gap-1.5 px-2.5 rounded-lg border text-xs transition-all ${
                  isRunning
                    ? 'border-nv-accent/45 bg-nv-accent/15 text-nv-accent'
                    : isExpanded
                      ? 'border-white/[0.14] bg-white/[0.08] text-nv-text-primary'
                      : 'border-white/[0.08] bg-white/[0.03] text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06]'
                }`}
                title={`${module.label}${module.subtitle ? ` - ${module.subtitle}` : ''}`}
              >
                <span>{module.label}</span>
                <ChevronUp
                  size={12}
                  className={`transition-transform ${isExpanded ? '' : 'rotate-180'} ${isRunning ? 'text-nv-accent' : ''}`}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
