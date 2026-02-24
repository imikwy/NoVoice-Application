import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LayoutGrid, Search, Pin, Check, Code2, ChevronRight, Download, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { APP_REGISTRY, getAllTags } from '../apps/registry';
import { useApp } from '../context/AppContext';
import api from '../utils/api';

export default function AppStoreView() {
  const {
    pinApp, unpinApp, isPinnedApp, setActiveView,
    installedExtensions, isInstalledExtension, installExtension, uninstallExtension,
  } = useApp();

  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState('All');

  // Community extensions from server
  const [communityApps, setCommunityApps] = useState([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState(null);
  const [installingId, setInstallingId] = useState(null);
  const [uninstallingId, setUninstallingId] = useState(null);

  const fetchCommunity = () => {
    setCommunityLoading(true);
    setCommunityError(null);
    api.getExtensionsRegistry()
      .then((data) => {
        setCommunityApps(Array.isArray(data) ? data : []);
        setCommunityLoading(false);
      })
      .catch(() => {
        setCommunityError('Could not load community apps.');
        setCommunityLoading(false);
      });
  };

  useEffect(() => { fetchCommunity(); }, []);

  const allTags = useMemo(() => ['All', ...getAllTags()], []);

  const filteredBuiltIn = useMemo(() => {
    const q = query.toLowerCase().trim();
    return APP_REGISTRY.filter((app) => {
      const matchesQuery =
        !q ||
        app.name.toLowerCase().includes(q) ||
        app.description.toLowerCase().includes(q) ||
        app.author?.toLowerCase().includes(q);
      const matchesTag = activeTag === 'All' || (app.tags ?? []).includes(activeTag);
      return matchesQuery && matchesTag;
    });
  }, [query, activeTag]);

  const filteredCommunity = useMemo(() => {
    const q = query.toLowerCase().trim();
    return communityApps.filter((app) => {
      const matchesQuery =
        !q ||
        app.name.toLowerCase().includes(q) ||
        app.description.toLowerCase().includes(q) ||
        app.author?.toLowerCase().includes(q);
      const matchesTag = activeTag === 'All' || (app.tags ?? []).includes(activeTag);
      return matchesQuery && matchesTag;
    });
  }, [communityApps, query, activeTag]);

  const handleInstall = async (app) => {
    if (installingId) return;
    setInstallingId(app.id);
    try {
      await installExtension(app);
    } catch (err) {
      console.error('Install failed:', err);
    } finally {
      setInstallingId(null);
    }
  };

  const handleUninstall = async (id) => {
    if (uninstallingId) return;
    setUninstallingId(id);
    try {
      await uninstallExtension(id);
    } catch (err) {
      console.error('Uninstall failed:', err);
    } finally {
      setUninstallingId(null);
    }
  };

  return (
    <div className="flex-1 bg-nv-content flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-4 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-nv-accent/15 flex items-center justify-center">
            <LayoutGrid size={17} className="text-nv-accent" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-nv-text-primary leading-none">App Store</h1>
            <p className="text-[11px] text-nv-text-tertiary mt-0.5">
              {APP_REGISTRY.length + communityApps.length}{' '}
              {APP_REGISTRY.length + communityApps.length === 1 ? 'app' : 'apps'} available
            </p>
          </div>
        </div>

        <div className="ml-auto relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-nv-text-tertiary pointer-events-none" />
          <input
            type="text"
            placeholder="Search apps…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-white/[0.05] border border-white/[0.08] rounded-xl pl-8 pr-4 py-2 text-sm text-nv-text-primary placeholder-nv-text-tertiary outline-none focus:border-nv-accent/40 transition-colors w-56"
          />
        </div>
      </div>

      {/* Tag pills */}
      {allTags.length > 1 && (
        <div className="px-6 py-2.5 border-b border-white/[0.04] flex items-center gap-2 overflow-x-auto shrink-0">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                activeTag === tag
                  ? 'bg-nv-accent text-white'
                  : 'bg-white/[0.06] text-nv-text-secondary hover:bg-white/[0.10] hover:text-nv-text-primary'
              }`}
            >
              {tag.charAt(0).toUpperCase() + tag.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">

        {/* ── Built-in apps ── */}
        {filteredBuiltIn.length > 0 && (
          <section>
            <p className="text-[11px] font-semibold text-nv-text-tertiary uppercase tracking-wider mb-3">
              Built-in
            </p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filteredBuiltIn.map((app) => {
                const pinned = isPinnedApp(app.id);
                return (
                  <motion.div
                    key={app.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 flex gap-4 hover:bg-white/[0.04] transition-colors group"
                  >
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 border border-white/[0.05]"
                      style={{ backgroundColor: app.iconColor ? `${app.iconColor}20` : 'rgba(255,255,255,0.05)' }}
                    >
                      {app.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-nv-text-primary leading-none">{app.name}</p>
                          <p className="text-[11px] text-nv-text-tertiary mt-0.5">{app.author} · v{app.version}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {pinned && (
                            <button
                              onClick={() => setActiveView({ type: 'app', id: app.id })}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/[0.06] text-nv-text-secondary hover:bg-white/[0.10] hover:text-nv-text-primary transition-all"
                            >
                              Open <ChevronRight size={10} />
                            </button>
                          )}
                          <button
                            onClick={() => (pinned ? unpinApp(app.id) : pinApp(app.id))}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                              pinned
                                ? 'bg-nv-accent/15 text-nv-accent hover:bg-nv-danger/15 hover:text-nv-danger'
                                : 'bg-white/[0.08] text-nv-text-secondary hover:bg-nv-accent/15 hover:text-nv-accent'
                            }`}
                          >
                            {pinned ? <><Check size={10} /> Pinned</> : <><Pin size={10} /> Pin</>}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-nv-text-secondary mt-2 line-clamp-2 leading-relaxed">
                        {app.description}
                      </p>
                      {app.tags?.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {app.tags.map((tag) => (
                            <span key={tag} className="px-1.5 py-0.5 rounded-md bg-white/[0.05] text-[10px] text-nv-text-tertiary">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Community Apps ── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <p className="text-[11px] font-semibold text-nv-text-tertiary uppercase tracking-wider">
              Community
            </p>
            <button
              onClick={fetchCommunity}
              className="w-5 h-5 rounded flex items-center justify-center text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all"
              title="Refresh"
            >
              <RefreshCw size={11} className={communityLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          {communityLoading && (
            <div className="flex items-center gap-2 py-6 text-nv-text-tertiary">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs">Loading community apps…</span>
            </div>
          )}

          {communityError && !communityLoading && (
            <div className="rounded-2xl border border-white/[0.06] p-4 text-center">
              <p className="text-xs text-nv-text-tertiary">{communityError}</p>
              <button onClick={fetchCommunity} className="text-xs text-nv-accent hover:underline mt-1">
                Retry
              </button>
            </div>
          )}

          {!communityLoading && !communityError && filteredCommunity.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/[0.08] p-8 flex flex-col items-center gap-2 text-center">
              <span className="text-3xl">🌐</span>
              <p className="text-sm text-nv-text-tertiary">
                {communityApps.length === 0
                  ? 'No community apps approved yet — be the first!'
                  : 'No apps match your search'}
              </p>
            </div>
          )}

          {!communityLoading && filteredCommunity.length > 0 && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filteredCommunity.map((app) => {
                const installed = isInstalledExtension(app.id);
                const isInstalling = installingId === app.id;
                const isUninstalling = uninstallingId === app.id;
                return (
                  <motion.div
                    key={app.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 flex gap-4 hover:bg-white/[0.04] transition-colors"
                  >
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 border border-white/[0.05]"
                      style={{ backgroundColor: app.iconColor ? `${app.iconColor}20` : 'rgba(255,255,255,0.05)' }}
                    >
                      {app.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-nv-text-primary leading-none">{app.name}</p>
                          <p className="text-[11px] text-nv-text-tertiary mt-0.5">{app.author} · v{app.version}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {installed && (
                            <button
                              onClick={() => setActiveView({ type: 'app', id: app.id })}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/[0.06] text-nv-text-secondary hover:bg-white/[0.10] hover:text-nv-text-primary transition-all"
                            >
                              Open <ChevronRight size={10} />
                            </button>
                          )}
                          {installed ? (
                            <button
                              onClick={() => handleUninstall(app.id)}
                              disabled={isUninstalling}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/[0.08] text-nv-text-secondary hover:bg-nv-danger/15 hover:text-nv-danger transition-all disabled:opacity-50"
                            >
                              {isUninstalling
                                ? <><Loader2 size={10} className="animate-spin" /> Removing…</>
                                : <><Trash2 size={10} /> Remove</>
                              }
                            </button>
                          ) : (
                            <button
                              onClick={() => handleInstall(app)}
                              disabled={isInstalling || !window.electronAPI?.extensions}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-nv-accent/15 text-nv-accent hover:bg-nv-accent/25 transition-all disabled:opacity-50"
                              title={!window.electronAPI?.extensions ? 'Only available in the desktop app' : undefined}
                            >
                              {isInstalling
                                ? <><Loader2 size={10} className="animate-spin" /> Installing…</>
                                : <><Download size={10} /> Install</>
                              }
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-nv-text-secondary mt-2 line-clamp-2 leading-relaxed">
                        {app.description}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {app.tags?.map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 rounded-md bg-white/[0.05] text-[10px] text-nv-text-tertiary">
                            {tag}
                          </span>
                        ))}
                        {app.repository && (
                          <a
                            href={app.repository}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-nv-accent hover:underline"
                          >
                            Source ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* Developer section */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Code2 size={15} className="text-nv-accent" />
            <h2 className="text-sm font-semibold text-nv-text-primary">Build an App</h2>
          </div>
          <p className="text-xs text-nv-text-secondary leading-relaxed mb-3">
            Build a React app using our template, publish it as a GitHub Release, and submit the link for review. Once approved, it appears here for all users — no new install needed.
          </p>
          <div className="rounded-xl bg-nv-channels/60 border border-white/[0.06] p-3 font-mono text-[11px] space-y-1.5">
            <p>
              <span className="text-nv-text-tertiary">// 1.</span>{' '}
              <span className="text-nv-text-secondary">Clone</span>{' '}
              <span className="text-nv-accent/90">novoice-app-template</span>{' '}
              <span className="text-nv-text-secondary">from GitHub</span>
            </p>
            <p>
              <span className="text-nv-text-tertiary">// 2.</span>{' '}
              <span className="text-nv-text-secondary">Build your React app, publish a GitHub Release</span>
            </p>
            <p>
              <span className="text-nv-text-tertiary">// 3.</span>{' '}
              <span className="text-nv-text-secondary">Submit the release URL — we review &amp; approve 🚀</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
