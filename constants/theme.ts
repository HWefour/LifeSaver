// Thème "Wayfinder" (nuit & lanterne) — palette, typographie et échelles
// d'espacement/rayons reprises telles quelles de la maquette de design (voir
// section TOKENS de la maquette fournie). Ce module est la référence pour
// tout écran restylé selon ce design ; il ne dépend pas du mécanisme
// light/dark existant de `components/Themed.tsx` (la maquette est un thème
// sombre unique, pas un couple clair/sombre).

export const colors = {
  bg: '#0B0F1A',
  bgElevated: '#0E1422',
  surface: '#151C2B',
  surfaceAlt: '#1C2435',
  border: '#2A3446',
  borderSubtle: '#1F2839',
  text: '#F4EFE8',
  textMuted: '#96A2B6',
  textFaint: '#6A768A',
  lantern: '#FFA94A',
  ember: '#FF6B5A',
  jade: '#58D6A8',
  iris: '#9B8CFA',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  full: 999,
} as const;

// Noms des familles de police une fois chargées via `useFonts`
// (@expo-google-fonts/bricolage-grotesque, @expo-google-fonts/instrument-sans)
// dans `app/_layout.tsx`.
export const fonts = {
  heading: 'BricolageGrotesque_600SemiBold',
  headingBold: 'BricolageGrotesque_700Bold',
  body: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodySemiBold: 'InstrumentSans_600SemiBold',
  bodyBold: 'InstrumentSans_700Bold',
} as const;

// Échelle typographique de la maquette : display 32/29/25/20, title 19,
// body 16/15, label 13/12, micro 11.
export const typeScale = {
  display32: 32,
  display29: 29,
  display25: 25,
  display20: 20,
  title19: 19,
  body16: 16,
  body15: 15,
  label13: 13,
  label12: 12,
  micro11: 11,
} as const;

// Dégradés "avatar initiales" de la maquette, utilisés en rotation simple
// faute d'un vrai système de photo de profil (Storage pas encore branché).
export const avatarGradients: [string, string][] = [
  [colors.lantern, colors.ember],
  [colors.jade, '#2F9E8C'],
  [colors.iris, '#6B5BD6'],
];
