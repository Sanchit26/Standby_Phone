import type { CapacitorConfig } from '@capacitor/cli'
const config: CapacitorConfig = {
  appId: 'com.standby.productivity',
  appName: 'Standby',
  webDir: 'dist',
  loggingBehavior: 'none',
  plugins: { SystemBars: { hidden: true, insetsHandling: 'disable' } },
}
export default config
