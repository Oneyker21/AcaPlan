// AcaPlan Design System
// Colors inspired by UNAN institutional blue with modern accents

export const Colors = {
  // Primary palette
  primary: '#1E3A5F',        // Deep institutional blue
  primaryLight: '#2E5C8A',
  primaryDark: '#0F2640',

  // Accent
  accent: '#4A90D9',         // Bright blue
  accentLight: '#6BA8E8',

  // Semantic
  success: '#2ECC71',
  warning: '#F39C12',
  error: '#E74C3C',
  info: '#3498DB',

  // Neutrals
  white: '#FFFFFF',
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceElevated: '#FAFBFC',
  border: '#E1E5EB',
  borderLight: '#F0F2F5',

  // Text
  textPrimary: '#1A1D23',
  textSecondary: '#5A6270',
  textTertiary: '#8B95A5',
  textInverse: '#FFFFFF',
  textLink: '#4A90D9',

  // Dark mode
  dark: {
    background: '#0D1117',
    surface: '#161B22',
    surfaceElevated: '#1C2333',
    border: '#30363D',
    borderLight: '#21262D',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    textTertiary: '#6E7681',
  },
};

export const Typography = {
  fontFamily: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
  },
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    hero: 40,
  },
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
};

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
};
