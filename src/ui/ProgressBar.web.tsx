import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import { formatTime } from '@/utils/format';

interface WebProgressBarProps {
  value: number;
  max: number;
  onSeek?: (value: number) => void;
  height?: number;
  showThumb?: boolean;
  label?: string;
  formatValue?: (value: number) => string;
}

const HIDE_DELAY = 700;
const PILL_WIDTH = 58;

/**
 * Web implementation uses a real `<input type="range">`. Firefox does not fire
 * the React Native Web Pressable/Gesture Handler mouse and keyboard paths
 * reliably, while a native range gives click, drag, arrows and Home/End for
 * free. The visual track and scrub pill are drawn on top, pointer-events: none.
 */
export function ProgressBar({
  value,
  max,
  onSeek,
  height = 4,
  showThumb = false,
  label,
  formatValue,
}: WebProgressBarProps) {
  const theme = useTheme();
  const [scrub, setScrub] = useState<number | null>(null);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const displayRatio = scrub ?? ratio;
  const displayValue = Math.round(displayRatio * max);
  const safeMax = Math.max(1, Math.round(max));
  const inputValue = Math.max(0, Math.min(safeMax, displayValue));
  const tooltip = formatValue ? formatValue(displayValue) : formatTime(displayValue);

  useEffect(() => {
    if (scrub === null || interacting) return;
    const timer = setTimeout(() => setScrub(null), HIDE_DELAY);
    return () => clearTimeout(timer);
  }, [scrub, interacting]);

  const commit = useCallback(
    (next: number) => {
      if (!onSeek || max <= 0) return;
      const clamped = Math.max(0, Math.min(max, Math.round(next)));
      setScrub(clamped / max);
      onSeek(clamped);
    },
    [max, onSeek],
  );

  const commitFromClientX = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      commit(((clientX - rect.left) / rect.width) * max);
    },
    [commit, max],
  );

  // Track the drag on the window, not the input, so Firefox also follows a
  // pointer that leaves the thin bar. The native range is pointer-events:none
  // and only supplies focus/keyboard/accessibility semantics.
  useEffect(() => {
    if (!dragging || typeof window === 'undefined') return;
    const move = (event: PointerEvent) => commitFromClientX(event.clientX);
    const end = () => {
      setDragging(false);
      setInteracting(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [commitFromClientX, dragging]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!onSeek || max <= 0) return;
    const step = event.shiftKey ? 30 : 5;
    const base = Number(event.currentTarget.value) || displayValue;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = base - step;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = base + step;
        break;
      case 'PageDown':
        next = base - 30;
        break;
      case 'PageUp':
        next = base + 30;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    commit(next);
  };

  const wrapper: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: Math.max(height + 12, 20),
    display: 'flex',
    alignItems: 'center',
    outline: focused ? `2px solid ${theme.colors.accent}` : 'none',
    outlineOffset: 2,
    borderRadius: 6,
    cursor: onSeek ? 'pointer' : 'default',
    touchAction: 'none',
    userSelect: 'none',
  };

  const track: CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    height,
    borderRadius: height / 2,
    backgroundColor: theme.colors.accentSoft,
    overflow: 'visible',
    pointerEvents: 'none',
  };

  const fill: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: `${displayRatio * 100}%`,
    height,
    borderRadius: height / 2,
    backgroundColor: theme.colors.accent,
  };

  const showThumbNow = showThumb || hover || focused || scrub !== null;
  const thumb: CSSProperties = {
    position: 'absolute',
    left: `${displayRatio * 100}%`,
    top: '50%',
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    marginTop: -6,
    backgroundColor: theme.colors.accent,
    opacity: showThumbNow ? 1 : 0,
    pointerEvents: 'none',
  };

  const tooltipStyle: CSSProperties = {
    position: 'absolute',
    left: `${displayRatio * 100}%`,
    bottom: height + 14,
    transform: 'translateX(-50%)',
    minWidth: PILL_WIDTH,
    height: 26,
    padding: '2px 8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.elevated,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: '18px',
    pointerEvents: 'none',
    zIndex: 2,
  };

  return (
    <div
      ref={barRef}
      style={wrapper}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPointerDown={(event: React.PointerEvent<HTMLDivElement>) => {
        if (!onSeek) return;
        event.preventDefault();
        inputRef.current?.focus();
        setDragging(true);
        setInteracting(true);
        commitFromClientX(event.clientX);
      }}
      onPointerUp={() => {
        setDragging(false);
        setInteracting(false);
      }}
      onPointerCancel={() => {
        setDragging(false);
        setInteracting(false);
      }}
    >
      {onSeek ? (
        <input
          ref={inputRef}
          type="range"
          min={0}
          max={safeMax}
          step={1}
          value={inputValue}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={Math.round(max)}
          aria-valuenow={Math.round(scrub !== null ? scrub * max : value)}
          aria-valuetext={tooltip}
          tabIndex={0}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            commit(Number(event.currentTarget.value))
          }
          onKeyDown={onKeyDown}
          onBlur={() => {
            setFocused(false);
            setInteracting(false);
          }}
          style={
            {
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              margin: 0,
              opacity: 0,
              pointerEvents: 'none',
              zIndex: 1,
            } as CSSProperties
          }
        />
      ) : null}
      <div style={track}>
        <div style={fill} />
      </div>
      <div style={thumb} />
      {onSeek && scrub !== null ? (
        <div data-testid="seek-preview" style={tooltipStyle}>
          {tooltip}
        </div>
      ) : null}
    </div>
  );
}
