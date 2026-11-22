import { db } from './database.ts'
import { newEntity } from './entity.ts'
import type { MediaItem } from '../types/models.ts'

export const library = () => db.media.orderBy('sortOrder').toArray()
export const preferred = async () => (await db.librarySettings.get('default'))?.value
export const setDefault = (value: string) => db.librarySettings.put({ id: 'default', value })
const folder = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('sanctuary', { create: true })
export function mediaKind(file: File): MediaItem['kind'] {
  if (/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)) return 'image'
  if (/^video\/(mp4|webm|ogg|quicktime)$/.test(file.type)) return 'video'
  throw new Error('Choose a JPEG, PNG, WebP, GIF, AVIF, MP4, WebM, Ogg or MOV file that your device can play.')
}
export async function importMedia(file: File) {
  const kind = mediaKind(file)
  if (!file.size) throw new Error('The file is empty.')
  const entity = newEntity()
  const dir = typeof navigator.storage?.getDirectory === 'function' ? await folder().catch(() => null) : null
  if (!dir && file.size > 32 * 1024 * 1024) throw new Error('This device supports imports up to 32 MiB without private file storage.')
  try {
    if (dir) {
      const handle = await dir.getFileHandle(entity.id, { create: true })
      const writable = await handle.createWritable()
      await file.stream().pipeTo(writable)
    }
    await db.transaction('rw', db.media, db.mediaBlobs, async () => {
      if (!dir) await db.mediaBlobs.add({ id: entity.id, blob: file })
      const last = await db.media.orderBy('sortOrder').last()
      await db.media.add({ ...entity, name: file.name, kind, storage: dir ? 'file' : 'blob',
        size: file.size, sortOrder: (last?.sortOrder ?? -1) + 1 })
    })
    return entity.id
  } catch (e) {
    await dir?.removeEntry(entity.id).catch(() => {})
    throw new Error(e instanceof DOMException && e.name === 'QuotaExceededError'
      ? 'Device storage is full.' : 'Import failed. Check the available storage and try again.')
  }
}
export async function loadMedia(item: MediaItem) {
  if (item.storage === 'file') return (await (await folder()).getFileHandle(item.id)).getFile()
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
    if (await preferred() === item.id) await db.librarySettings.delete('default')
  })
}
