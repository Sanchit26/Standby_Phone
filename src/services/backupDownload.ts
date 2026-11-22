import { Capacitor, registerPlugin } from '@capacitor/core'

const native = registerPlugin<{ exportFile(options: { name: string; json: string }): Promise<{ saved: boolean }> }>('StandbyBackup')
export async function saveBackup(name: string, json: string) {
  if (Capacitor.getPlatform() === 'android') return (await native.exportFile({ name, json })).saved
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
  return true
}
