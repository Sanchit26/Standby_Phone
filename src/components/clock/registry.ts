import type { ComponentType } from 'react'
import { Modern, Thin, LED, Flip, Pixel, Terminal, Outline, Serif } from './DigitalClock'
import type { ThemeId } from '../../themes/types'

export const clockAccents = { default: 'Face default', frost: 'Frost blue', amber: 'Amber', mint: 'Mint' } as const

export interface ClockDisplay {
  format: 'device' | '12h' | '24h'
  seconds: boolean
  accent: keyof typeof clockAccents
}

export interface ClockFace {
  name: string
  themes: readonly ThemeId[]
  supportsAccent: boolean
  Component: ComponentType<ClockDisplay & { now?: Date }>
}

const themes = ['amoled-minimal', 'dark-fantasy-rpg'] as const
function register(name: string, Component: ClockFace['Component'], supportsAccent = true): ClockFace {
  return { name, Component, themes, supportsAccent }
}

export const faces = {
  digital: register('Modern Digital', Modern),
  thin: register('Minimal Thin', Thin),
  led: register('Retro LED', LED),
  flip: register('Flip Clock', Flip, false),
  pixel: register('Fantasy Pixel', Pixel),
  terminal: register('Terminal', Terminal),
  outline: register('Outline Digital', Outline),
  serif: register('Elegant Serif', Serif),
} satisfies Record<string, ClockFace>

export type FaceId = keyof typeof faces
