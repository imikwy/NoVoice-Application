import { useState, useEffect } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMaximized);
      window.electronAPI.onMaximizeChange?.(setIsMaximized);
    }
  }, []);

  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => {
    window.electronAPI?.maximize();
    setIsMaximized(!isMaximized);
  };
  const handleClose = () => window.electronAPI?.close();

  return (
    <div className="drag-region h-8 bg-nv-sidebar flex items-center justify-between shrink-0 border-b border-white/[0.04]">
      {/* Left: App name */}
      <div className="flex items-center gap-2 pl-4 no-drag">
        <div className="w-3 h-3 rounded-full bg-nv-accent" />
        <span className="text-[11px] font-semibold text-nv-text-secondary tracking-wider uppercase">
          NoVoice
        </span>
      </div>

      {/* Right: Window controls */}
      <div className="flex items-center no-drag h-full">
        <button
          onClick={handleMinimize}
          className="h-full px-3.5 flex items-center justify-center hover:bg-white/[0.06] transition-colors duration-150"
        >
          <Minus size={13} className="text-nv-text-secondary" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-full px-3.5 flex items-center justify-center hover:bg-white/[0.06] transition-colors duration-150"
        >
          {isMaximized ? (
            <Copy size={11} className="text-nv-text-secondary" />
          ) : (
            <Square size={11} className="text-nv-text-secondary" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="h-full px-3.5 flex items-center justify-center hover:bg-red-500/80 transition-colors duration-150 group"
        >
          <X size={13} className="text-nv-text-secondary group-hover:text-white" />
        </button>
      </div>
    </div>
  );
}
