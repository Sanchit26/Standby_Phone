import { Capacitor, registerPlugin } from '@capacitor/core'
import { createDeviceCalendarStore, type DeviceCalendarBridge } from './deviceCalendarStore'

export const deviceCalendarAvailable = Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('StandbyCalendar')
export const deviceCalendar = createDeviceCalendarStore(deviceCalendarAvailable
  ? registerPlugin<DeviceCalendarBridge>('StandbyCalendar') : undefined)
