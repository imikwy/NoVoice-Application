import { useState, useEffect } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { getAppById } from '../apps/registry';
import { useApp } from '../context/AppContext';

export default function AppView() {
  const { activeView, setActiveView, getExtensionById, getOrLoadExtensionComponent } = useApp();
  const appId = activeView?.id;

  // Built-in app from static registry
  const builtIn = appId ? getAppById(appId) : null;
  // Installed community extension
  const extension = appId ? getExtensionById(appId) : null;

  const app = builtIn ?? extension;

  // Lazy-loaded component (extensions only)
  const [extComponent, setExtComponent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!extension || builtIn) return;
    setExtComponent(null);
    setLoadError(null);
    setLoading(true);
    getOrLoadExtensionComponent(appId)
      .then((comp) => {
        setExtComponent(() => comp);
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(err.message);
        setLoading(false);
      });
  }, [appId]);

  if (!app) {
    return (
      <div className="flex-1 bg-nv-content flex items-center justify-center">
        <p className="text-sm text-nv-text-tertiary">App not found</p>
      </div>
    );
  }

  const AppComponent = builtIn ? builtIn.component : extComponent;

  return (
    <div className="flex-1 bg-nv-content flex flex-col overflow-hidden">
      {/* App header bar */}
      <div className="border-b border-white/[0.06] px-4 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={() => setActiveView({ type: 'appstore' })}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.07] transition-all"
          title="Back to App Store"
        >
          <ChevronLeft size={14} />
        </button>

        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-lg border border-white/[0.05] shrink-0"
          style={{
            backgroundColor: app.iconColor ? `${app.iconColor}20` : 'rgba(255,255,255,0.05)',
          }}
        >
          {app.icon}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-nv-text-primary leading-none">{app.name}</p>
          <p className="text-[10px] text-nv-text-tertiary mt-0.5">
            {app.author} · v{app.version}
          </p>
        </div>
      </div>

      {/* App content */}
      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="h-full flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-nv-text-tertiary" />
            <span className="text-sm text-nv-text-tertiary">Loading {app.name}…</span>
          </div>
        )}
        {loadError && (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-8">
            <p className="text-sm text-nv-danger">Failed to load extension</p>
            <p className="text-xs text-nv-text-tertiary">{loadError}</p>
          </div>
        )}
        {AppComponent && !loading && !loadError && <AppComponent />}
      </div>
    </div>
  );
}
