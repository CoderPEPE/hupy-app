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
  warning: '#F2B705',
  info: '#2F80ED',

  // Auth screen atmosphere (soft lavender tints to match the logo)
  authBackground: '#F5F4FE',
  authBlobPrimary: '#DDDAF7',
  authBlobSecondary: '#D3DAF8',
  authBlobTertiary: '#EBE9FB',
  authCardShadow: '#3A35A0',
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
