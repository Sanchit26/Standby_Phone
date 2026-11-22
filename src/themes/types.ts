export const themes = {
  'amoled-minimal': { name: 'AMOLED Minimal' },
  'dark-fantasy-rpg': { name: 'Dark Fantasy RPG' },
} as const

export type ThemeId = keyof typeof themes
export const DEFAULT_THEME: ThemeId = 'amoled-minimal'
