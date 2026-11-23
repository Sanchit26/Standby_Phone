import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { useSyncExternalStore } from 'react'

export interface RemoteNote {
  id: string
  pkg: string
  app: string
  title: string
  text: string
  time: number
  icon: string
}
export interface RemoteMedia {
  status: string
  title?: string
  artist?: string
  album?: string
  art?: string
  playing?: boolean
  state?: number
  actions?: number
  position?: number
  duration?: number
  updated?: number
  speed?: number
  remote?: boolean
}
export interface Phone {
  revision: number
  role: 'sender' | 'receiver'
  name: string
  running: boolean
  connected: boolean
  paired: boolean
  peerName: string
  address: string
  host: string
  status: string
  code: string
  candidate: string
  access: boolean
  phonePermission: boolean
  apps: string[]
  previews: boolean
  calls: boolean
  music: boolean
  banners: boolean
  minutes: number
  rows: RemoteNote[]
  call: string
  callId: string
  callSource: string
  banner: string
  media: RemoteMedia
  pending: string
  result: string
}
interface PhonePlugin {
  snapshot(): Promise<Phone>
  action(options: { action: string; value: string; position?: number }): Promise<void>
  applications(): Promise<{ apps: { pkg: string; name: string }[] }>
  addListener(event: 'change', callback: () => void): Promise<PluginListenerHandle>
}
export const nativePhone = Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('PhoneLink')
export const phoneLink = registerPlugin<PhonePlugin>('PhoneLink')
const initial: Phone = {
  revision: 0,
  role: 'receiver',
  name: '',
  paired: false,
  running: false,
  connected: false,
  peerName: '',
  address: '',
  host: '',
  status: 'Stopped',
  code: '',
  candidate: '',
  access: false,
  phonePermission: false,
  apps: [],
  previews: false,
  calls: false,
  music: false,
  banners: true,
  minutes: 30,
  rows: [],
  call: '',
  callId: '',
  callSource: '',
  banner: '',
  media: { status: 'disconnected' },
  pending: '',
  result: '',
}
let current = initial
const observers = new Set<() => void>()
let started = false
let fetching = false
let dirty = false
async function refresh() {
  dirty = true
  if (fetching) return
  fetching = true
  try {
    while (dirty) {
      dirty = false
      current = await phoneLink.snapshot()
      for (const listener of observers) listener()
    }
  } catch {
    current = { ...initial, status: 'Phone connection unavailable' }
    for (const listener of observers) listener()
  } finally {
    fetching = false
  }
}
function subscribe(listener: () => void) {
  observers.add(listener)
  if (!started && nativePhone) {
    started = true
    void phoneLink.addListener('change', refresh).then(refresh).catch(refresh)
  }
  return () => {
    observers.delete(listener)
  }
}
export function usePhone() {
  return useSyncExternalStore(subscribe, () => current)
}
export function usePhoneMode() {
  return useSyncExternalStore(subscribe, () =>
    nativePhone && current === initial ? 'loading' : current.role,
  )
}
export function phoneAction(action: string, value = '', position?: number) {
  return phoneLink.action({ action, value, position })
}
