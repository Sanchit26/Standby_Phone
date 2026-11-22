export const screens = [
  ['Settings', '/settings'], ['Standby', '/'], ['Quest Hub', '/quests'],
  ['Calendar', '/calendar'], ['Spotify', '/spotify'], ['Sanctuary', '/sanctuary'],
] as const
export function adjacentPage(path: string, step: number) {
  const i = screens.findIndex(([, route]) => route === path)
  return i >= 0 ? screens[i + step]?.[1] : undefined
}
export function gestureAxis(dx: number, dy: number) {
  const x = Math.abs(dx), y = Math.abs(dy)
  if (Math.max(x, y) < 12) return undefined
  if (x >= y * 1.5) return 'horizontal'
  if (y >= x * 1.5) return 'vertical'
}
export const controls = 'button, a, input, select, textarea, label, summary, [role="button"], [role="slider"], [contenteditable], [data-page-swipe="off"]'
