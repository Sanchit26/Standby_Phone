export function formatDuration(milliseconds: number) {
  const total = Math.ceil(milliseconds / 1000)
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map(value => String(value).padStart(2, '0')).join(':')
}
