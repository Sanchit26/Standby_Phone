import type { CapacitorConfig } from '@capacitor/cli'
const config: CapacitorConfig = {
  appId: 'com.standby.productivity',
  appName: 'Standby',
  webDir: 'dist',
  plugins: { SystemBars: { hidden: true, insetsHandling: 'disable' } },
}
export default config
