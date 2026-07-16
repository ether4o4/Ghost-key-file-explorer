/**
 * Device-level touch detection (stable for the session — unlike viewport width,
 * the input type doesn't change at runtime). Used to turn off HTML5 drag-and-drop
 * (which fights touch scrolling and causes the UI to "freeze") and to switch the
 * file panes to tap-to-open / long-press-menu interaction on phones and tablets.
 */
export const IS_TOUCH =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || (window.matchMedia?.('(pointer: coarse)')?.matches ?? false));
