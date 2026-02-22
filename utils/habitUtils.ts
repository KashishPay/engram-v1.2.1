import React from 'react';

/* utils/habitUtils.ts
   Source of truth for habit colors across Profile + Habit Tracker.
   Palette chosen for clarity, contrast, and consistent identity per habit.
*/

export type HabitColorToken = {
  dotBg: string;      // background for small dots/markers (500-600 range for AA)
  dotText?: string;   // optional text color when needed
  chipBg?: string;    // for buttons/chips (500)
  chipText?: string;  // readable text color for chips
  ring?: string;      // optional ring/outline for tiny elements
};

export const HABIT_COLORS: HabitColorToken[] = [
  // index 0: Red
  { dotBg: 'bg-red-500', dotText: 'text-white', chipBg: 'bg-red-500', chipText: 'text-white', ring: 'ring-red-300' },
  // index 1: Blue
  { dotBg: 'bg-blue-500', dotText: 'text-white', chipBg: 'bg-blue-500', chipText: 'text-white', ring: 'ring-blue-300' },
  // index 2: Green
  { dotBg: 'bg-green-500', dotText: 'text-white', chipBg: 'bg-green-500', chipText: 'text-white', ring: 'ring-green-300' },
  // index 3: Violet
  { dotBg: 'bg-violet-500', dotText: 'text-white', chipBg: 'bg-violet-500', chipText: 'text-white', ring: 'ring-violet-300' },
  // index 4: Amber (needs dark text)
  { dotBg: 'bg-amber-500', dotText: 'text-gray-900', chipBg: 'bg-amber-500', chipText: 'text-gray-900', ring: 'ring-amber-300' },
  // index 5: Rose
  { dotBg: 'bg-rose-500', dotText: 'text-white', chipBg: 'bg-rose-500', chipText: 'text-white', ring: 'ring-rose-300' },
  // index 6: Cyan (needs dark text)
  { dotBg: 'bg-cyan-500', dotText: 'text-gray-900', chipBg: 'bg-cyan-500', chipText: 'text-gray-900', ring: 'ring-cyan-300' },
  // index 7: Indigo
  { dotBg: 'bg-indigo-500', dotText: 'text-white', chipBg: 'bg-indigo-500', chipText: 'text-white', ring: 'ring-indigo-300' },
];

/** Returns a token for a habit index (stable across the app). */
export function getHabitColor(index: number): HabitColorToken {
  if (index < 0) return HABIT_COLORS[0];
  return HABIT_COLORS[index % HABIT_COLORS.length];
}

/** Utility: build classes for tiny dot (completed day) with ring for legibility on small sizes. */
export function dotClassesFor(index: number): string {
  const t = getHabitColor(index);
  return [
    'inline-flex items-center justify-center',
    t.dotBg ?? '',
    t.dotText ?? '',
    t.ring ? `${t.ring} ring-1` : 'ring-transparent'
  ].join(' ');
}

/** Utility: build classes for action chip/button in Habit Tracker. */
export function chipClassesFor(index: number): string {
  const t = getHabitColor(index);
  return [
    'flex items-center justify-center',
    'transition-all shadow-sm',
    t.chipBg ?? (t.dotBg ?? ''),
    t.chipText ?? (t.dotText ?? 'text-white')
  ].join(' ');
}

/** Build small dot classes per habit index with accessible contrast. */
export function smallDotClassesFor(index: number): string {
  const t = getHabitColor(index);
  // Slightly bigger than 1px to remain visible; add ring for contrast.
  return [
    'h-1.5 w-1.5 rounded-full',
    t.dotBg ?? 'bg-gray-500',
    t.ring ? `${t.ring} ring-1` : 'ring-white/50 ring-1'
  ].join(' ');
}

/** Absolute positions around the date for 4 dots (clockwise from top-right). */
export const DOT_POS_4 = [
  'absolute top-1 right-1',
  'absolute bottom-1 right-1',
  'absolute bottom-1 left-1',
  'absolute top-1 left-1'
];

/** Bottom-row placement for 2–3 dots centered at the chip base. */
export function bottomRowContainer(): string {
  return 'absolute bottom-1 left-0 right-0 flex justify-center space-x-0.5 px-1 pointer-events-none';
}

/** Small dot classes per habit index with accessible contrast and pointer-safety */
export function ringDotClassesFor(index: number): string {
  const t = getHabitColor(index);
  return [
    'absolute',                 // positioned via left/top (polar coords)
    'h-[6px] w-[6px] rounded-full', // ~1.5rem ring radius looks good in 32px chips
    t.dotBg ?? 'bg-gray-500',
    // thin ring for visibility on light/dark backgrounds
    t.ring ? `${t.ring} ring-[1px]` : 'ring-white/60 ring-[1px]',
    'pointer-events-none'       // dots should not block clicks
  ].join(' ');
}

/**
 * Compute evenly spaced (x,y) offsets for N dots on a circle.
 * Returns inline style string "left:XXpx; top:YYpx;" relative to the chip's center.
 *
 * @param i  index of dot
 * @param n  total dots (max 8)
 * @param r  radius in px (distance from center to dot center)
 * @param center  pixel center of chip box (cx, cy)
 * @param startDeg starting angle (deg) to avoid overlapping top/stroke; default -90 (top)
 */
export function polarStyle(i: number, n: number, r: number, center: { cx: number; cy: number }, startDeg = -90): React.CSSProperties {
  const angle = ((360 / n) * i + startDeg) * Math.PI / 180;
  const x = center.cx + r * Math.cos(angle);
  const y = center.cy + r * Math.sin(angle);
  // Dot boxes use translate to center themselves; we provide left/top for the wrapper
  return {
      left: `${x.toFixed(1)}px`,
      top: `${y.toFixed(1)}px`,
      transform: 'translate(-50%,-50%)'
  };
}

/**
 * Decide ring radius and max dots based on chip size (square).
 * For typical 32px chip: radius ~10px is safe. Use up to 8 dots.
 */
export function ringConfig(chipSizePx: number) {
  const size = Math.max(24, Math.min(40, chipSizePx || 32)); // clamp for safety
  const r = Math.round(size * 0.32);                         // ~32% of side length
  const maxDots = 8;
  return { size, r, maxDots };
}