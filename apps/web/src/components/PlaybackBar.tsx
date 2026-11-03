interface PlaybackBarProps {
  eventsCount: number;
  eventIndex: number;
  playing: boolean;
  animationsEnabled: boolean;
  onAnimationsToggle: () => void;
  /** 跳转下标（直接 set）。 */
  onJump: (index: number) => void;
  /** 推进到下一个；末尾自然停。 */
  onNext: () => void;
  /** 回到上一个。 */
  onPrev: () => void;
  onPlayPause: () => void;
}

const TOTAL = 8;

export function PlaybackBar({
  eventsCount,
  eventIndex,
  playing,
  animationsEnabled,
  onAnimationsToggle,
  onJump,
  onNext,
  onPrev,
  onPlayPause
}: PlaybackBarProps) {
  const hasEvents = eventsCount > 0;
  const atFirst = eventIndex <= 0;
  const atLast = eventIndex >= eventsCount - 1;
  const displayCount = hasEvents ? eventsCount : TOTAL;

  return (
    <div className="playback-bar" role="group" aria-label="事件播放控制">
      <div className="playback-controls">
        <button
          type="button"
          className="playback-btn prev"
          onClick={onPrev}
          disabled={!hasEvents || atFirst}
          aria-label="上一步"
        >
          ‹ 上一步
        </button>
        <button
          type="button"
          className="playback-btn play"
          onClick={onPlayPause}
          disabled={!hasEvents || atLast}
          aria-label={playing ? "暂停" : "播放"}
        >
          {playing ? "暂停" : "播放"}
        </button>
        <button
          type="button"
          className="playback-btn next"
          onClick={onNext}
          disabled={!hasEvents || atLast}
          aria-label="下一步"
        >
          下一步 ›
        </button>
      </div>
      <div className="playback-track">
        {hasEvents ? (
          Array.from({ length: displayCount }).map((_, i) => (
            <button
              key={i}
              type="button"
              className={`playback-dot ${i === eventIndex ? "active" : ""}`}
              aria-label={`跳转到事件 ${i}`}
              aria-current={i === eventIndex ? "step" : undefined}
              onClick={() => onJump(i)}
            >
              {i}
            </button>
          ))
        ) : (
          <span className="playback-empty">暂无事件</span>
        )}
      </div>
      <button
        type="button"
        className={`playback-btn anim-toggle ${animationsEnabled ? "on" : "off"}`}
        onClick={onAnimationsToggle}
        aria-label={animationsEnabled ? "关闭动画" : "开启动画"}
        aria-pressed={animationsEnabled}
        title={animationsEnabled ? "关闭动画（可让 prefers-reduced-motion 用户先关）" : "开启动画"}
      >
        {animationsEnabled ? "动效开" : "动效关"}
      </button>
      <span className="playback-position" aria-live="polite">
        {hasEvents ? `事件 ${eventIndex + 1} / ${displayCount}` : "—"}
      </span>
    </div>
  );
}
