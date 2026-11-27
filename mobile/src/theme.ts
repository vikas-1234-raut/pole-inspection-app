// theme.ts — single source of colours, sizes and spacing for the whole app.
// Navy + amber = utility/safety look. High contrast so it reads in sunlight.
export const colors = {
  navy: '#0B1F3A',
  navyLight: '#16335C',
  amber: '#FFB300',
  amberDark: '#C78A00',
  green: '#16A34A',
  red: '#DC2626',
  orange: '#F59E0B',
  bg: '#F2F4F7',
  card: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
  disabled: '#94A3B8',
  // Camera overlays: dark, semi-transparent so the pole stays visible.
  scrim: 'rgba(6,16,32,0.70)',
  scrimLight: 'rgba(6,16,32,0.45)',
  faintWhite: 'rgba(255,255,255,0.30)',
};

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const font = { title: 24, h2: 18, body: 15, small: 13, tiny: 11 };

// Minimum tap target (px).
export const TAP = 44;
