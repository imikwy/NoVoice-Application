import { useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  Link2,
  ListMusic,
  Music2,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Trash2,
} from 'lucide-react';

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function parseHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'music';
  }
}

export default function VoiceMusicPanel({
  channelId,
  canControlMusic,
  isInThisVoiceChannel,
  isOwner,
  musicState,
  musicPositionSec,
  musicError,
  requestVoiceMusicState,
  enqueueVoiceMusic,
  toggleVoiceMusicPlayback,
  skipVoiceMusicNext,
  skipVoiceMusicPrevious,
  seekVoiceMusic,
  selectVoiceMusicTrack,
  removeVoiceMusicTrack,
  clearVoiceMusicQueue,
}) {
  const [trackUrl, setTrackUrl] = useState('');
  const [trackTitle, setTrackTitle] = useState('');

  const stateForChannel = useMemo(() => {
    if (!musicState || musicState.channelId !== channelId) return null;
    return musicState;
  }, [musicState, channelId]);

  const queue = stateForChannel?.queue || [];
  const currentTrack = stateForChannel?.currentTrack || null;
  const playbackState = stateForChannel?.playbackState || 'idle';
  const queueCount = queue.length;
  const hasTrack = Boolean(currentTrack);
  const hasDuration = Number.isFinite(currentTrack?.durationSec) && currentTrack.durationSec > 0;
  const effectivePosition = Math.max(0, Number(musicPositionSec || stateForChannel?.positionSec || 0));
  const seekMax = hasDuration ? currentTrack.durationSec : Math.max(effectivePosition + 30, 240);
  const canControl = Boolean(canControlMusic && channelId);

  useEffect(() => {
    if (!channelId) return;
    requestVoiceMusicState(channelId);
  }, [channelId, requestVoiceMusicState]);

  const handleQueueTrack = () => {
    if (!canControl) return;
    const safeUrl = trackUrl.trim();
    if (!safeUrl) return;

    const sent = enqueueVoiceMusic({
      channelId,
      url: safeUrl,
      title: trackTitle.trim(),
    });

    if (!sent) return;
    setTrackUrl('');
    setTrackTitle('');
  };

  const trackProgress = hasDuration
    ? Math.min(100, (effectivePosition / currentTrack.durationSec) * 100)
    : 0;

  return (
    <div className="border-t border-white/[0.05] bg-gradient-to-t from-black/20 to-transparent px-4 pb-4 pt-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <div className="rounded-2xl border border-white/[0.08] bg-nv-surface/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Music2 size={14} className="text-nv-accent shrink-0" />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-nv-text-tertiary">Now Playing</p>
            <span className="ml-auto text-[10px] text-nv-text-tertiary">{queueCount} queued</span>
          </div>

          <div className="flex items-center gap-3 min-h-[64px]">
            <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/[0.08] bg-black/35 shrink-0">
              {currentTrack?.coverUrl ? (
                <img src={currentTrack.coverUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/[0.06] to-transparent">
                  <Music2 size={17} className="text-nv-text-tertiary" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm text-nv-text-primary font-medium truncate">
                {currentTrack?.title || 'Queue a track to start listening'}
              </p>
              <p className="text-[11px] text-nv-text-tertiary truncate">
                {currentTrack ? `${currentTrack.sourceLabel} - requested by ${currentTrack.requestedByName}` : 'Direct audio links sync playback. Spotify/YouTube can be queued as shared links.'}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
              <div className="h-full rounded-full bg-nv-accent transition-[width] duration-150" style={{ width: `${trackProgress}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-nv-text-tertiary tabular-nums">
              <span>{formatDuration(effectivePosition)}</span>
              <span>{hasDuration ? formatDuration(currentTrack.durationSec) : '--:--'}</span>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            {[
              { key: 'previous', Icon: SkipBack, action: () => skipVoiceMusicPrevious(channelId) },
              { key: 'toggle', Icon: playbackState === 'playing' ? Pause : Play, action: () => toggleVoiceMusicPlayback(channelId), primary: true },
              { key: 'next', Icon: SkipForward, action: () => skipVoiceMusicNext(channelId) },
            ].map(({ key, Icon, action, primary }) => (
              <button
                key={key}
                onClick={action}
                disabled={!canControl || !hasTrack}
                className={`h-8 rounded-lg inline-flex items-center justify-center border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  primary
                    ? 'px-3 border-nv-accent/35 bg-nv-accent/10 text-nv-accent hover:bg-nv-accent/15'
                    : 'w-8 border-white/[0.08] text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.05]'
                }`}
                title={canControl ? undefined : 'You need voice rights to control music'}
              >
                <Icon size={14} />
              </button>
            ))}

            <input
              type="range"
              min={0}
              max={seekMax}
              step={1}
              value={Math.min(seekMax, effectivePosition)}
              onChange={(e) => seekVoiceMusic(channelId, Number(e.target.value))}
              disabled={!canControl || !hasTrack}
              className="ml-1 flex-1 accent-[#34C759] disabled:opacity-50"
              title={hasDuration ? 'Seek track position' : 'Seeking works best when duration is known'}
            />
          </div>

          {!canControl && (
            <p className="text-[10px] text-nv-text-tertiary mt-2">
              {isInThisVoiceChannel || isOwner
                ? 'Read-only mode. You can listen, but not control this queue.'
                : 'Join voice (or be server owner) to control the shared queue.'}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-nv-surface/20 p-3 flex flex-col min-h-[232px]">
          <div className="flex items-center gap-2 mb-2">
            <ListMusic size={14} className="text-nv-text-secondary shrink-0" />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-nv-text-tertiary">Queue</p>
            {canControl && queue.length > 0 && (
              <button
                onClick={() => clearVoiceMusicQueue(channelId)}
                className="ml-auto text-[10px] px-2 py-1 rounded-md border border-white/[0.1] text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.05]"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
            {queue.length === 0 && (
              <div className="h-full min-h-[120px] flex items-center justify-center rounded-xl border border-dashed border-white/[0.1] text-xs text-nv-text-tertiary">
                Queue is empty
              </div>
            )}

            {queue.map((track, index) => {
              const isActive = currentTrack?.id === track.id;
              const isPlaying = isActive && playbackState === 'playing';
              return (
                <div
                  key={track.id}
                  className={`rounded-xl border px-2.5 py-2 transition-colors ${
                    isActive
                      ? 'border-nv-accent/35 bg-nv-accent/[0.08]'
                      : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => canControl && selectVoiceMusicTrack(channelId, track.id)}
                      disabled={!canControl}
                      className="w-6 h-6 rounded-lg border border-white/[0.1] text-[10px] text-nv-text-tertiary shrink-0 disabled:opacity-50"
                      title={canControl ? 'Switch to this track' : 'No control rights'}
                    >
                      {index + 1}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-medium truncate ${isActive ? 'text-nv-text-primary' : 'text-nv-text-secondary'}`}>
                        {track.title}
                      </p>
                      <p className="text-[10px] text-nv-text-tertiary truncate">
                        {track.sourceLabel} - {parseHost(track.url)}
                      </p>
                    </div>

                    <a
                      href={track.url}
                      target="_blank"
                      rel="noreferrer"
                      className="w-6 h-6 rounded-lg border border-white/[0.1] text-nv-text-tertiary hover:text-nv-text-primary inline-flex items-center justify-center"
                      title="Open source link"
                    >
                      <ExternalLink size={11} />
                    </a>

                    {canControl && (
                      <button
                        onClick={() => removeVoiceMusicTrack(channelId, track.id)}
                        className="w-6 h-6 rounded-lg border border-white/[0.1] text-nv-text-tertiary hover:text-nv-danger inline-flex items-center justify-center"
                        title="Remove from queue"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>

                  {isActive && (
                    <p className="text-[10px] text-nv-accent mt-1">
                      {isPlaying ? 'Playing live' : playbackState === 'paused' ? 'Paused' : 'Ready'}
                    </p>
                  )}
                  {!isActive && track.source !== 'direct' && (
                    <p className="text-[10px] text-nv-text-tertiary mt-1">
                      Link source (not direct stream)
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 border-t border-white/[0.06] pt-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 space-y-1.5">
                <div className="relative">
                  <Link2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nv-text-tertiary pointer-events-none" />
                  <input
                    value={trackUrl}
                    onChange={(e) => setTrackUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleQueueTrack();
                      }
                    }}
                    placeholder="Paste Spotify/YouTube/audio URL"
                    disabled={!canControl}
                    className="w-full h-8 rounded-lg border border-white/[0.1] bg-black/25 pl-8 pr-2 text-xs text-nv-text-primary placeholder:text-nv-text-tertiary/70 focus:outline-none focus:border-nv-accent/45 disabled:opacity-50"
                  />
                </div>
                <input
                  value={trackTitle}
                  onChange={(e) => setTrackTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleQueueTrack();
                    }
                  }}
                  placeholder="Optional custom title"
                  disabled={!canControl}
                  className="w-full h-8 rounded-lg border border-white/[0.1] bg-black/25 px-2.5 text-xs text-nv-text-primary placeholder:text-nv-text-tertiary/70 focus:outline-none focus:border-nv-accent/45 disabled:opacity-50"
                />
              </div>

              <button
                onClick={handleQueueTrack}
                disabled={!canControl || !trackUrl.trim()}
                className="w-8 h-8 rounded-lg border border-nv-accent/35 bg-nv-accent/10 text-nv-accent inline-flex items-center justify-center hover:bg-nv-accent/15 disabled:opacity-40 disabled:cursor-not-allowed"
                title={canControl ? 'Add to queue' : 'No control rights'}
              >
                <Plus size={14} />
              </button>
            </div>
            {musicError && (
              <p className="text-[10px] text-nv-danger mt-2">{musicError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
