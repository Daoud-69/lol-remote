/** Hextech-ish palette. Dark only — this app is used in a dark room. */
export const theme = {
  bg: "#0a1428",
  surface: "#101f3a",
  surfaceRaised: "#16294a",
  border: "#1e3a5f",
  gold: "#c8aa6e",
  goldBright: "#f0e6d2",
  blue: "#0ac8b9",
  red: "#e84057",
  green: "#22c55e",
  text: "#f0e6d2",
  textMuted: "#8fa3bf",
  textDim: "#5a6f8c",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
