import type { ComponentType } from 'react'
import { TasksWidget } from './TasksWidget'
import { ProgressWidget, CalendarWidget, FocusWidget, QuoteWidget } from './OfflineWidgets'

import { SanctuaryWidget } from '../../pages/Sanctuary/Sanctuary'
import { MediaWidget } from '../../pages/Spotify/Spotify'
export interface WidgetDefinition {
  name: string
  description: string
  capabilities: readonly ('permission' | 'native')[]
  Component: ComponentType<{ expanded: boolean }>
}

export const widgets = {
  tasks: { name: 'Tasks', description: 'See and manage the active task category.', capabilities: [], Component: TasksWidget },
  progress: { name: 'Progress', description: 'Track completion of the active list.', capabilities: [], Component: ProgressWidget },
  calendar: { name: 'Calendar', description: 'See the current month offline.', capabilities: [], Component: CalendarWidget },
  focus: { name: 'Focus', description: 'See the current timer and recorded sessions.', capabilities: [], Component: FocusWidget },
  quote: { name: 'Quote', description: 'Browse a small offline quote collection.', capabilities: [], Component: QuoteWidget },
  sanctuary: { name: 'Sanctuary', description: 'Open your local ambient library.', capabilities: [], Component: SanctuaryWidget },
  media: { name: 'Media', description: 'Preview the layout for future native playback.', capabilities: ['native'], Component: MediaWidget },
} satisfies Record<string, WidgetDefinition>

export type WidgetId = keyof typeof widgets
export const widgetIds = Object.keys(widgets) as WidgetId[]
