export const colors = {
  // Brand purple (from logo.jpg) — kept as primary for backward compat
  primary: '#4A44BE',
  primaryPressed: '#3832A4',
  primarySoft: '#E3E1FA',

  // Extended brand ramp
  brand: {
    purple: '#4A44BE',
    purpleDeep: '#3832A4',
    purpleSoft: '#E3E1FA',
    indigo: '#6C63E0',
    lavender: '#A8A4EC',
    accent: '#3D8BFF',
    mint: '#8EE3B8',
    /** Warm counterpoint to the purple — the headline stop and its rule. */
    orange: '#F2762E',
    /** Tinted panel behind a feature card (Home hero, Hupy Live). */
    purpleWash: '#EFECFB',
  },

  // Text
  text: '#1F1F1F',
  textMuted: '#777777',
  textFaint: '#A8A8A8',
  textOnPrimary: '#FFFFFF',
  textOnBrand: '#FFFFFF',

  // Surfaces
  background: '#FFFFFF',
  surface: '#F7F7F7',
  surfaceElevated: '#FFFFFF',
  border: '#E5E5E5',
  inputBackground: '#F1F0FB',
  inputBackgroundFocus: '#FFFFFF',
  card: '#FFFFFF',

  // Semantic
  error: '#EA2B2B',
  errorSoft: '#FFE1E1',
  success: '#1FAA59',
  successSoft: '#E3F9EA',
  warning: '#F2B705',
  warningSoft: '#FFF1D6',
  info: '#2F80ED',
  infoSoft: '#E1EDFF',
  gold: '#FBBF24',

  // Auth screen atmosphere (soft lavender tints to match the logo)
  authBackground: '#F5F4FE',
  authBlobPrimary: '#DDDAF7',
  authBlobSecondary: '#D3DAF8',
  authBlobTertiary: '#EBE9FB',
  authCardShadow: '#3A35A0',

  // Flashcard difficulty rating chips (Não lembrei / Difícil / Quase / Aprendi)
  rating: {
    forgot: '#F43F5E',
    forgotSoft: '#FFE4E9',
    hard: '#F97316',
    hardSoft: '#FFEEDD',
    almost: '#3B82F6',
    almostSoft: '#E1EDFF',
    known: '#22C55E',
    knownSoft: '#E3F9EA',
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  round: 999,
} as const;

export const shadows = {
  card: {
    shadowColor: '#1F1F1F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 5,
  },
  button: {
    shadowColor: '#3832A4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 0,
    elevation: 4,
  },
} as const;

/**
 * The app's type scale. Screens previously each picked their own size for the
 * same role (screen titles ranged over 20/22/24/26/30/38pt), so equivalent
 * headings looked different from tab to tab. Every text role now resolves
 * here — reach for a role rather than a raw fontSize.
 */
export const typography = {
  /** Big expressive heading — the focus of a dedicated screen (chapter intro). */
  display: { fontSize: 28, fontWeight: '800', letterSpacing: -0.4, lineHeight: 36 },
  /** Standard screen title (Profile, Lessons, Cards, pickers). */
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  /** Section heading inside a screen ("Your planets", "Badges"). */
  section: { fontSize: 17, fontWeight: '800' },
  /** Card / row heading. */
  cardTitle: { fontSize: 15, fontWeight: '800' },
  /** Default body copy. */
  body: { fontSize: 14, lineHeight: 20 },
  /** Secondary/supporting copy. */
  caption: { fontSize: 12, lineHeight: 17 },
  /** All-caps eyebrow above a title. */
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  /** Small bold label (stat values, pills). */
  label: { fontSize: 13, fontWeight: '700' },
} as const;

/** Reusable surface recipes, so a "card" looks the same everywhere. */
export const surfaces = {
  /** Standard elevated content card. */
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  /** Flat, non-elevated grouping (settings rows, quiet panels). */
  flat: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
  },
} as const;

/** Standard tap target for a circular icon button. */
export const ICON_BUTTON_SIZE = 40;
