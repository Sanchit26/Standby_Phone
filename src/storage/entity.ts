export function newEntity(now = Date.now()) {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const id = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return { id, createdAt: now, updatedAt: now }
}
