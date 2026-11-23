import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const android = new URL('../android/app/src/main/', import.meta.url)
const manifest = readFileSync(new URL('AndroidManifest.xml', android), 'utf8')
const activity = readFileSync(new URL('java/com/standby/productivity/MainActivity.java', android), 'utf8')

test('MainActivity requests both landscape orientations and handles configuration changes', () => {
  const declaration = manifest.match(/<activity\b[^>]*android:name="\.MainActivity"[^>]*>/)?.[0]
  assert.ok(declaration)
  assert.match(declaration, /android:screenOrientation="sensorLandscape"/)
  const changes = declaration.match(/android:configChanges="([^"]+)"/)[1].split('|')
  assert.ok(changes.includes('orientation') && changes.includes('screenSize'))
  assert.match(activity, /onConfigurationChanged\([^)]*\)\s*\{[^}]*requestApplyInsets\(/)
})

test('the activity owns the keep-screen-on flag only while started', () => {
  assert.match(activity, /onStart\(\)\s*\{[^}]*addFlags\(WindowManager\.LayoutParams\.FLAG_KEEP_SCREEN_ON\)/)
  assert.match(activity, /onStop\(\)\s*\{[^}]*clearFlags\(WindowManager\.LayoutParams\.FLAG_KEEP_SCREEN_ON\)/)
  assert.doesNotMatch(activity, /FLAG_SHOW_WHEN_LOCKED|FLAG_TURN_SCREEN_ON|WakeLock/)
  assert.doesNotMatch(manifest, /android\.permission\.WAKE_LOCK/)
})
