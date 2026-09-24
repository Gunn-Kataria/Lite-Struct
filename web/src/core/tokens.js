// Single source of truth for the visual design. Every component reads from the theme built here
// (styled-components ThemeProvider). No hex codes or magic numbers elsewhere.

const palette = {
  light: {
    mode: 'light',
    bg: '#f5f6f8',
    surface: '#ffffff',
    surfaceAlt: '#f0f2f5',
    border: '#e2e5ea',
    borderStrong: '#cbd0d8',
    text: '#111827',
    textMuted: '#556070',
    textFaint: '#8a93a3',
    primary: '#e8620f',
    primaryHover: '#c94f08',
    primaryText: '#ffffff',
    primarySoft: '#fff0e3',
    gradient: ['#ffa561', '#f26b1d'],
    onGradient: '#ffffff',
    danger: '#cf2a1f',
    dangerSoft: '#fdeceb',
    success: '#0f9d58',
    successSoft: '#e6f6ed',
    warning: '#a16207',
    warningSoft: '#fdf4d8',
    overlay: 'rgba(12, 16, 26, 0.45)',
    skeleton: '#e6e9ee',
    skeletonHi: '#f3f4f7',
    // Dark navigation chrome (same in both modes, like an IDE / admin console).
    nav: '#141821',
    navSurface: '#1c212d',
    navHover: 'rgba(255,255,255,0.06)',
    navActive: 'rgba(255,255,255,0.11)',
    navText: '#d5dae4',
    navMuted: '#8b94a6',
    navBorder: 'rgba(255,255,255,0.08)',
  },
  dark: {
    mode: 'dark',
    bg: '#0e1118',
    surface: '#161a23',
    surfaceAlt: '#1d222d',
    border: '#272d3a',
    borderStrong: '#3a4252',
    text: '#eceff4',
    textMuted: '#a3acbb',
    textFaint: '#727b8c',
    primary: '#ff9d5c',
    primaryHover: '#ffb27f',
    primaryText: '#1c0d03',
    primarySoft: '#3a2312',
    gradient: ['#ffb070', '#f57a2c'],
    onGradient: '#ffffff',
    danger: '#ff6b60',
    dangerSoft: '#3a1c1a',
    success: '#3ecf8e',
    successSoft: '#123024',
    warning: '#e6b422',
    warningSoft: '#33290d',
    overlay: 'rgba(0, 0, 0, 0.6)',
    skeleton: '#232936',
    skeletonHi: '#2c3342',
    nav: '#0a0d13',
    navSurface: '#141821',
    navHover: 'rgba(255,255,255,0.06)',
    navActive: 'rgba(255,255,255,0.12)',
    navText: '#d5dae4',
    navMuted: '#7f8899',
    navBorder: 'rgba(255,255,255,0.07)',
  },
};

export const spacing = { none: 0, xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

export const radius = { sm: 4, md: 6, lg: 8, xl: 12, pill: 999 };

export const fontFamily = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// weight keys used by `type` -> CSS font-weight
export const fontWeight = { regular: 400, medium: 500, semibold: 600, bold: 700 };

// size / line-height / weight key
export const type = {
  caption: { size: 12, line: 16, weight: 'regular' },
  small: { size: 13, line: 18, weight: 'regular' },
  body: { size: 14, line: 20, weight: 'regular' },
  bodyStrong: { size: 14, line: 20, weight: 'semibold' },
  label: { size: 12, line: 16, weight: 'semibold' },
  title: { size: 16, line: 22, weight: 'semibold' },
  heading: { size: 20, line: 26, weight: 'semibold' },
  display: { size: 26, line: 32, weight: 'bold' },
};

export const shadow = {
  none: 'none',
  sm: '0 1px 2px rgba(16, 24, 40, 0.06)',
  md: '0 4px 12px rgba(16, 24, 40, 0.08)', // single layer: styled-components cannot parse comma-separated shadows
  lg: '0 12px 32px rgba(16, 24, 40, 0.18)',
  glow: '0 4px 14px rgba(242, 107, 29, 0.38)',
  glowHover: '0 8px 24px rgba(242, 107, 29, 0.5)',
  focus: (color) => `0 0 0 3px ${color}33`,
};

export const layout = {
  sidebarWidth: 288,
  wideBreakpoint: 960, // >= : persistent sidebar + centre pane. Below: sidebar becomes the home screen.
  tableBreakpoint: 720, // centre pane >= : records as a table. Below: stacked cards.
  contentMaxWidth: 1120,
  formMaxWidth: 720,
  fullMaxWidth: 1600, // record forms use (almost) the whole centre pane
  gridTwoCol: 620, // form width >= : 2 columns of fields
  gridThreeCol: 980, // form width >= : 3 columns
  panelWidth: 460, // right-hand drawer
  controlHeight: 40,
};

// durations in ms (framer-motion wants seconds: use motion.s(ms))
export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  spring: { type: 'spring', damping: 24, stiffness: 300 },
  s: (ms) => ms / 1000,
};

/**
 * Builds the theme object handed to styled-components.
 * overrides lets a host application re-brand the UI: flat palette keys applied to both modes
 * ({ primary: '#0a7', gradient: ['#3c9', '#0a7'] }), and/or per mode ({ dark: { bg: '#000' } }).
 */
export const buildTheme = (mode, overrides = {}) => {
  const { light, dark, ...common } = overrides || {};
  const perMode = (mode === 'dark' ? dark : light) || {};
  return {
    ...palette[mode],
    ...common,
    ...perMode,
    spacing,
    radius,
    fontFamily,
    fontWeight,
    type,
    shadow,
    layout,
    motion,
  };
};

// Deterministic accent per struct name (avatar tint) - a restrained set that works on light and dark.
const AVATAR_KEYS = ['primary', 'success', 'warning', 'danger'];
export const avatarKey = (name = '') => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_KEYS[h % AVATAR_KEYS.length];
};
