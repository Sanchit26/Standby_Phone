import { Preferences } from '@capacitor/preferences'
import { clockAccents, faces, type ClockDisplay, type FaceId } from '../components/clock/registry'
import { quotes } from '../components/widgets/quotes'
import { widgets, widgetIds, type WidgetId } from '../components/widgets/registry'
import { themes, DEFAULT_THEME, type ThemeId } from '../themes/types'

export interface UserPreferences {
  theme: ThemeId
  face: FaceId
  clock: ClockDisplay
  widget: WidgetId
  widgetOrder: WidgetId[]
  widgetEnabled: WidgetId[]
  widgetDefault: WidgetId
  quoteIndex: number
  taskCategory: string | null
}

function hasId<T extends object>(registry: T, value: unknown): value is Extract<keyof T, string> {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(registry, value)
}

export function normalizePreferences(value: unknown): UserPreferences {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const theme = hasId(themes, raw.theme) ? raw.theme : DEFAULT_THEME
  const clock = raw.clock as Partial<ClockDisplay> | null
  const order: WidgetId[] = Array.isArray(raw.widgetOrder)
    ? raw.widgetOrder.filter((id): id is WidgetId => hasId(widgets, id)) : []
  const widgetOrder = [...new Set([...order, ...widgetIds])]
  const enabled = Array.isArray(raw.widgetEnabled)
    ? raw.widgetEnabled.filter((id): id is WidgetId => hasId(widgets, id)) : widgetIds
  const available = new Set(enabled)
  if (!enabled.some(id => id !== 'media')) available.add('tasks')
  const widgetEnabled = widgetOrder.filter(id => available.has(id))
  const widgetDefault = hasId(widgets, raw.widgetDefault) && available.has(raw.widgetDefault)
    ? raw.widgetDefault : widgetEnabled.find(id => id !== 'media') ?? 'tasks'
  return {
    theme,
    face: hasId(faces, raw.face) && faces[raw.face].themes.some(t => t === theme) ? raw.face : 'digital',
    clock: { format: clock?.format === '12h' || clock?.format === '24h' ? clock.format : 'device',
      accent: hasId(clockAccents, clock?.accent) ? clock.accent : 'default',
      seconds: typeof clock?.seconds === 'boolean' ? clock.seconds : true },
    widgetOrder,
    widgetEnabled,
    widgetDefault,
    widget: hasId(widgets, raw.widget) && available.has(raw.widget) ? raw.widget : widgetDefault,
    taskCategory: typeof raw.taskCategory === 'string' && raw.taskCategory ? raw.taskCategory : null,
    quoteIndex: typeof raw.quoteIndex === 'number' && Number.isInteger(raw.quoteIndex) &&
      raw.quoteIndex >= 0 && raw.quoteIndex < quotes.length ? raw.quoteIndex : 0,
  }
}

export async function readJson(key: string): Promise<unknown> {
  const { value } = await Preferences.get({ key })
  if (value === null) return null
  try { return JSON.parse(value) } catch { return null }
}

export async function loadPreferences() {
  const stored = await readJson('display')
  if (stored !== null) return normalizePreferences(stored)
  const legacy = await Preferences.get({ key: 'theme' })
  return normalizePreferences({ theme: legacy.value })
}
