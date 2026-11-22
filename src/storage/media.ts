import { db } from './database.ts'
import { newEntity } from './entity.ts'
import type { MediaItem } from '../types/models.ts'

export const library = () => db.media.orderBy('sortOrder').toArray()
export const preferred = async () => (await db.librarySettings.get('default'))?.value
export const selectMedia = (value: string) => db.librarySettings.put({ id: 'selected', value })
export const setDefault = (value: string) => db.librarySettings.bulkPut([
  { id: 'default', value }, { id: 'selected', value },
])
export const selection = async () => (await db.librarySettings.get('selected'))?.value
export function resolveMedia(slots: readonly string[], selected?: string, fallback?: string) {
  return [selected, fallback].find(value => value !== undefined && slots.includes(value)) ?? slots[0]
}
const folder = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('sanctuary', { create: true })
export function mediaKind(file: File): MediaItem['kind'] {
  if (/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)) return 'image'
  if (/^video\/(mp4|webm|ogg|quicktime)$/.test(file.type)) return 'video'
  throw new Error('Choose a JPEG, PNG, WebP, GIF, AVIF, MP4, WebM, Ogg or MOV file that your device can play.')
}
export function validateMedia(file: File) {
  const kind = mediaKind(file)
  if (!file.size) throw new Error('The file is empty.')
  if (file.size > 512 * 1024 * 1024) throw new Error('Choose a file up to 512 MiB.')
  return kind
}
export async function importMedia(file: File) {
  const kind = validateMedia(file)
  const entity = newEntity()
  let dir = typeof navigator.storage?.getDirectory === 'function' ? await folder().catch(() => null) : null
  try {
    if (dir) {
      const handle = await dir.getFileHandle(entity.id, { create: true })
      if (typeof handle.createWritable === 'function') {
        await file.stream().pipeTo(await handle.createWritable())
      } else {
        await dir.removeEntry(entity.id)
        dir = null
      }
    }
    if (!dir && file.size > 32 * 1024 * 1024) throw new Error('This device supports imports up to 32 MiB without private file storage.')
    await db.transaction('rw', db.media, db.mediaBlobs, db.librarySettings, async () => {
      if (!dir) await db.mediaBlobs.add({ id: entity.id, blob: file })
      const last = await db.media.orderBy('sortOrder').last()
      await db.media.add({ ...entity, name: file.name, kind, storage: dir ? 'file' : 'blob',
        size: file.size, mime: file.type, sortOrder: (last?.sortOrder ?? -1) + 1 })
      if (!last && !await preferred()) await setDefault(entity.id)
      else await selectMedia(entity.id)
    })
    return entity.id
  } catch (e) {
    await dir?.removeEntry(entity.id).catch(() => {})
    throw new Error(e instanceof DOMException && e.name === 'QuotaExceededError'
      ? 'Device storage is full.' : e instanceof Error ? e.message : 'Unable to save the media locally.')
  }
}
export async function loadMedia(item: MediaItem) {
  if (item.storage === 'file') {
    const file = await (await (await folder()).getFileHandle(item.id)).getFile()
    return item.mime ? file.slice(0, file.size, item.mime) : file
  }
  const row = await db.mediaBlobs.get(item.id)
  if (!row) throw new Error('Media file unavailable.')
  return row.blob
}
export async function reorderMedia(id: string, step: number) {
  await db.transaction('rw', db.media, async () => {
    const items = await library()
    const i = items.findIndex(item => item.id === id)
    if (i < 0 || !items[i + step]) return
    items.splice(i + step, 0, ...items.splice(i, 1))
    await db.media.bulkPut(items.map((item, sortOrder) => ({ ...item, sortOrder, updatedAt: Date.now() })))
  })
}
export async function removeMedia(item: MediaItem) {
  if (item.storage === 'file') {
    try { await (await folder()).removeEntry(item.id) }
    catch (e) { if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e }
  }
  await db.transaction('rw', db.media, db.mediaBlobs, db.librarySettings, async () => {
    await db.media.delete(item.id)
    await db.mediaBlobs.delete(item.id)
    if (await selection() === item.id) await db.librarySettings.delete('selected')
    if (await preferred() === item.id) await db.librarySettings.delete('default')
  })
}
