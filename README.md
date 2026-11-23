# Standby

Standby is a landscape Android productivity dashboard for a wall-mounted phone. The installed app uses packaged web assets, IndexedDB and native Preferences offline. Phase 2 provides the architecture for the dashboard.

## Development

Use Node 24 and npm. Use JDK 21 for the Android Gradle build. Run `npm ci`, then `npm run dev`. Use `npm test` for timer, task hierarchy and IndexedDB tests, `npm run typecheck` for strict TypeScript, `npm run lint` for linting and `npm run build` for a production bundle. `npm run preview` serves that bundle locally.

## Architecture

- **Navigation** uses React Router with hash URLs. Swipe left to advance through Settings, Standby, Quest Hub, Calendar, Spotify and Sanctuary. Swipe right to return. Each transition adds a history entry. Android Back gives an open modal the same dismissal behavior as Escape before using WebView history. The two ends stop.
- **Gestures** use Pointer Events on the page. Recognition requires 60 CSS pixels horizontally and a horizontal displacement at least 1.5 times the vertical displacement. Controls and gestures that start vertically are excluded. Put `data-page-swipe="off"` on any carousel or custom control that owns its own gestures.
- **Shared state** uses separate display and timer contexts. `useDisplay().update(patch)` normalizes changes. Startup loads Preferences before mounting providers. Serialized writes preserve update order. Preferences include theme, clock format, seconds, face, widget and widget order. Unknown IDs fall back to registered defaults. New widgets append to the saved order. The old theme key remains readable.
- **Faces and widgets** register a component under a stable ID in their respective registries under `src/components`. Faces declare compatible themes. Widget capabilities declare optional permission or native dependencies. An empty list denotes an offline widget. Digital and Tasks are the first entries. The clock owns its ticks.
- **Themes** share components and use global CSS tokens selected on the document root. Register a theme in `src/themes/types.ts` and supply its tokens in `index.css`. Settings switches themes immediately.
- **Structured storage** lives in Dexie. Version 2 retains the four original tables and keys, adds timestamps, and migrates reminders to the in-app channel. Legacy records without historical timestamps use migration time. Tasks reference a category and optionally a parent in that category. Use the asynchronous functions in `src/storage/repositories.ts` for categories, tasks and focus sessions.
- **Timers** use `useTimer().dispatch(action)` for start, pause, resume and reset. A running timer stores a wall-clock deadline. A paused timer stores the remaining milliseconds. Completion reconciles on expiry, startup and resume. Manual device-time changes affect a running deadline.
- **Lifecycle and reminders** use Capacitor App events on Android and visibility/pageshow events in browsers. The foreground scheduler observes persisted deadlines and reconciles on resume.

## Android

### Build the debug APK

Install Node 24, JDK 21, and Android SDK Platform 36, Build Tools 36.0.0 and Platform Tools through Android Studio's SDK Manager. Set `JAVA_HOME` to your JDK 21 directory. Configure the SDK location in Android Studio or set `ANDROID_HOME` if Gradle cannot find the SDK. From the repository root in PowerShell, run:

```powershell
npm ci
npm run build
npx cap sync android
Push-Location android
.\gradlew.bat :app:compileDebugJavaWithJavac :app:assembleDebug
Pop-Location
```

The output is [app-debug.apk](android/app/build/outputs/apk/debug/app-debug.apk). Its package ID is `com.standby.productivity`, version name `1.0` and version code `1`. The APK supports API 24 and later and includes the production web assets. Android uses a debug signature for this build.

### Install on the POCO X5 Pro

For manual installation, copy the APK over USB to the phone's Downloads folder. Open it in Files and allow installation from that source if Android prompts. Then open **Standby**.

For USB debugging, enable Developer options and USB debugging on the phone. Connect with a data cable, unlock the phone and approve the computer's prompt. From the repository root, use Platform Tools on your PATH or run `adb.exe` from its full path. Replace `YOUR_POCO_SERIAL` with the phone's serial shown as `device`.

```powershell
adb devices -l
adb -s YOUR_POCO_SERIAL shell getprop ro.product.model
adb -s YOUR_POCO_SERIAL install -r .\android\app\build\outputs\apk\debug\app-debug.apk
adb -s YOUR_POCO_SERIAL shell am start -W -n com.standby.productivity/.MainActivity
```

If ADB shows `unauthorized`, unlock the phone and accept the debugging prompt. If the phone is missing, try a data-capable cable and check the Windows USB driver. If Android reports an incompatible signature, stop and keep the installed copy and its data. An in-place update requires the same package ID and signing key. [Android ADB guide](https://developer.android.com/tools/adb)

The native activity uses `sensorLandscape` to support both landscape positions. When the camera moves to the opposite side, Standby recalculates the safe insets and keeps the WebView edge-to-edge. Android's edge gestures can reveal system bars temporarily. If HyperOS keeps the phone in one position, turn on **Auto-rotate** and check its per-app display settings. Android may override orientation requests on large screens or in some windowing modes.

Standby keeps the display on automatically while its activity is visible. The physical power button still turns the screen off. Android's normal timeout applies after leaving Standby. OLED protection can dim the display after 15 idle minutes while the screen stays on, and a touch restores brightness. The keep-awake behavior also applies with OLED protection disabled. [Android guidance on keeping the screen on](https://developer.android.com/develop/background-work/background-tasks/awake/screen-on)

Calendar synchronization requests `READ_CALENDAR` when enabled. The manifest also declares normal Internet access. Native speech uses the installed voice engine and brightness control applies to the Standby window without a system settings permission. Backup export uses the Android document picker.

### POCO X5 Pro acceptance checklist

Run these checks on the phone and record pass or fail. Use disposable entries and copies of test media. Record the Android and MIUI or HyperOS versions and WebView version if a check fails.

| Check | Action and expected result |
| --- | --- |
| A. First launch | Open Standby from the launcher. The bundled dashboard opens without a server. Android may display its fullscreen tutorial. Standby requests Calendar access only when enabled. |
| B. Landscape and fullscreen | Rotate the phone 180 degrees, then hold it upright. Standby uses both landscape positions and stays in landscape when upright. Check the camera's new inset, the outer frame, and the clock gallery and page swipes after rotation. An edge swipe still reveals the system bars temporarily. |
| C. Themes | Switch between AMOLED Minimal and Dark Fantasy RPG in Settings. Check the giant clock, small timer, right-side widgets, true black and the RPG frames for clipping and alignment. |
| D. Clock gallery | Hold the clock, choose a face, close and reopen the app. The selected face persists. |
| E. Swipes and widgets | Visit Settings ← Standby → Quest Hub → Calendar → Spotify → Sanctuary and reverse. Swipe vertically over the Standby widget and Sanctuary media. Double-tap a widget to expand it, hold it to manage it and verify task lists can still scroll. |
| F. Quest Hub | Create a test category, task and subtask. Complete a leaf, restart and verify the hierarchy, active category and its progress persist. |
| G. Countdown and stopwatch | Start a task timer, pause and resume, then check history after completion. Background a running stopwatch and return. The elapsed time reconciles and history records the session once. |
| H. Google Calendar | Sync the selected Google calendars on the phone, enable **Show device calendar events**, grant read access and select calendars. Check a timed event, a recurring occurrence and an all-day event. Verify local-time display, widget dots, today's notice, read-only entries and selection persistence. Disable the integration or deny permission to confirm local events stay usable. |
| I. Voice reminders | Select a voice, use **Test Voice**, then schedule a disposable foreground reminder. Check the overlay and announcement, Silence and Dismiss, and test speech again after returning from another app. |
| J. Offline TTS | Install offline voice data in Android's text-to-speech settings before enabling airplane mode. Use **Test Voice** and run a foreground reminder. Audio should play through the installed voice. |
| K. OLED mitigation | Keep Standby visible without input for over 15 minutes. Check that it dims without sleeping, then touch to restore brightness. Repeat with Home, lock and unlock, turning protection off, and a reminder appearing while dimmed. |
| L. Sanctuary | Import copies of a photo and a supported video. Check that video fills without stretching and photos fit by default. Tap the video, toggle audio, and wait for the control to hide. Check both playback preferences after relaunch, loop and pause behavior, and swipes and long press in both landscape positions. |
| M. Restart | Reopen Standby and verify display preferences, test tasks, timer state, reminders and imported media. Export a backup and confirm the document picker can save it. |
| N. Android Back | With the keyboard shown, press Back to dismiss it. With a task editor, widget or clock gallery open, press Back to dismiss the overlay first. With no overlay, verify Back returns through visited pages. |
| O. Charging and extended use | With a short phone timeout, confirm Standby remains visible past it. Press the power button to verify manual sleep still works. With Standby backgrounded, check that the normal timeout applies. During a longer charging test, check dimming, touch response, audio and temperature. |

If Calendar is empty, first confirm the events are visible in Google Calendar on the POCO and the intended calendars are synced to Android. If Test Voice reports no offline voice, download the language through the installed engine while online and try again. If a video fails to play, try a small H.264 MP4 as a test and capture the original format and codec. Voice reminder delivery depends on the foreground scheduler and is unavailable while the app is force-stopped.

For a failure, record the exact steps, expected and actual behavior, and a screenshot or screen recording. For startup crashes, capture the crash buffer immediately. For an issue while Standby is still running, capture just its process logs. Review captures for private content before sharing.

```powershell
adb -s YOUR_POCO_SERIAL logcat -b crash -d
$standbyPid = (adb -s YOUR_POCO_SERIAL shell pidof com.standby.productivity).Trim()
adb -s YOUR_POCO_SERIAL logcat --pid=$standbyPid -d
```

See the [14-phase development plan](docs/DEVELOPMENT_PLAN.md).

## Clock gallery

Hold the clock for about 600 ms or focus it and press Enter. Choose a live preview, set the time format, toggle seconds, or change the accent on supported faces. The selection and options are saved in Capacitor Preferences. Close with the gallery button, Escape, or Back.

To add a face, register its stable ID, component, theme compatibility and accent capability in `src/components/clock/registry.ts`. Accept a shared preview timestamp and render inside the existing clock area. Android hardware Back and touch gestures still need device verification.

## Standby widgets

Swipe or drag vertically in the right pane to change widgets. With the carousel focused, Up and Down do the same. Hold the widget or press G to open management. There you can enable widgets, reorder them, and choose the default used when the saved active widget is unavailable. Double-tap, double-click, or press Enter to expand the active widget. Close, Escape, and Back dismiss the overlay.

Register new widgets in `src/components/widgets/registry.ts` with a stable ID, name, description, capability metadata and component. Display preferences store enabled widgets, order, default and active widget, and the quote index. Tasks, progress, and focus history read local Dexie data. Tasks and Progress use the active category selected in Quest Hub. Media is a display-only placeholder. Android hardware Back and physical gestures still need device verification.

## Task management

Double-tap Tasks or focus it and press Enter to open its editor. Pick the category shown on Standby, manage category names, accents and order, and add or edit tasks with optional descriptions and due dates. The Parent task and Category fields move entire branches. Use the arrow buttons to reorder siblings.

Only tasks without children count toward progress. A parent is complete when all of its actionable descendants are complete. Checking or reopening a parent applies that state to the whole branch. Percentages are rounded to the nearest integer. Empty categories have no progress bar.

Dexie v3 preserves IDs and repairs broken hierarchy links. Tasks whose category is missing are grouped under Recovered tasks. Category deletion offers a choice to move the tasks or delete them. The latest deletion can be undone until the expanded editor closes. Unsaved forms are discarded on refresh. The active category is stored in Capacitor Preferences. Physical Android testing of the editor, especially the on-screen keyboard and Back, remains pending.

## Focus timer

Open the compact timer on Standby or choose Open timer controls in Settings. For a countdown, choose a 15, 25, 45, 60, or 90-minute preset, or enter 1–720 whole minutes. The last valid duration is saved. Closing the panel leaves the session running. Pause stops active time. Finish now records completion with the time actually focused. Cancel records a cancelled session. Reset cancels an active session and clears the display to idle.

Switch to **Stopwatch** in the same panel to count up from zero. It accumulates elapsed time only during running segments and recovers running or paused sessions across refresh and resume. Finish saves the session under its original ID. Switching away from an active session requires confirmation.

A deadline drives the running countdown. Dexie v4 saves timer state and terminal history together, with one record per session ID. An optional task link is for reference and does not affect task completion. The Focus widget shows today's completed count and time using local completion dates. Its expanded view shows the twelve most recent records, including cancelled sessions. A missing task is shown as unavailable. Legacy countdowns are restored where possible, and old records without a planned duration are labelled accordingly.

Suspended JavaScript resumes reconciliation when Standby becomes active, or on the next launch. The foreground completion message is visual. Manual clock changes can make a deadline arrive early or late. Remaining time is clamped to the current running segment's budget, and recorded focus time stays within the planned duration. Physical Android Back and suspension still need device testing.

## Quest Hub

Swipe left from Standby to manage to-do list categories. Each category shows its own actionable-task progress. Start Task selects that category for Standby.

## Voice Reminders

Open Settings → Voice Reminders to add a custom message. Schedule it for a specific local date and time, a daily wall-clock time, or an interval of at least five minutes. Edit, disable, or delete reminders from the list. The editor provides a test button and a choice of available offline voices, rate, and volume.

While Standby is active, the scheduler claims each occurrence and advances the deadline in one Dexie transaction. Daily reminders follow local wall-clock time and are limited to one delivery per local date. Intervals retain their cadence when reconciling a missed occurrence. On resume, occurrences more than one minute late are skipped and repeating schedules advance to the next future deadline. Up to four current occurrences are presented in scheduled-time order, with ID breaking ties. Additional simultaneous occurrences are logged as skipped. The overlay has a Silence / dismiss button and honors reduced motion.

History shows scheduled and actual trigger times, spoken completion, silence, skips, and speech errors. Legacy acknowledgments and interrupted claims remain unconfirmed. Clearing history leaves reminder schedules intact.

Android uses the platform text-to-speech engine and requires a compatible, installed offline voice. The browser uses local Speech Synthesis voices when available. Test Voice reports a missing engine or offline voice. Suspended, force-stopped, and terminated apps have no delivery guarantee. A later native scheduler can reuse the occurrence-claim and history boundary. Phase 11 adds no background service.

The obsolete XP and achievement writers and backfill have been retired. Historical tables remain intact. Task progress remains per category, and focus sessions retain their IDs.

## Sanctuary and Calendar

Swipe vertically in Sanctuary to browse the import screen, quote and imported media. Open Library with its corner button, a long press, or G while Sanctuary is focused. The library can change the quote, preview and import media, reorder or remove imports, and set the default. The current selection is saved and shared by the Sanctuary widget. Its preview uses the quote, a small image, or media metadata. Videos only decode on the full page.

Videos default to **Fill**. Sanctuary centers and crops the video to the full landscape display while preserving its aspect ratio. Photos default to **Fit**. Use Library to switch between Fit and Fill. Standby saves the choices for photos and videos separately. Black bars encoded into a video can remain visible.

Tap a playing video to show **Mute video** or **Unmute video** in the corner. The control hides after about three seconds. Library uses the same saved audio preference, which defaults to muted. Videos loop inline and pause when Library is open, Standby is backgrounded, or you leave Sanctuary. Use **Tap to play** if the browser or Android WebView blocks autoplay, especially when audio is enabled. Formats depend on the installed browser or WebView codecs.

The optional Chromium regression suite runs against a local dev or preview server with `node tests/sanctuary.browser.mjs`. It uses Playwright Core from `STANDBY_PLAYWRIGHT_MODULE` or the local module path. Set `STANDBY_BROWSER` to an installed Chromium executable and `STANDBY_TEST_URL` to the server URL if it differs from `http://127.0.0.1:4173`.

Imports use origin-private files where streaming writes are available, with a Dexie Blob fallback. Metadata and selection are stored separately in Dexie. Import limits are 512 MiB for private files and 32 MiB for fallback, subject to available storage. The Phase 13A.1 phone check covers fullscreen playback and system-edge gestures in both landscape positions.

The Calendar agenda, compact widget dots, and Standby today notice combine local events with selected Android calendars. Local events can be edited or deleted in Standby. Device events are labeled read-only and can be opened in a compatible Android calendar app.

### Device calendar setup

1. In Google Calendar or the device's account settings, enable synchronization for the calendars you want on the mounted phone. Confirm those events are visible in the Android calendar app.
2. In Standby, open Settings → Calendar Synchronization and turn on **Show device calendar events**. Grant Android read access and select the calendars to display.
3. Use **Refresh** to read the provider and see the last successful read time. Standby also refreshes on app resume and when you open or browse Calendar.

Standby uses only Android's read-calendar permission and reads bounded ranges of occurrences from the local provider. The Google Calendar app or another sync adapter supplies any cloud updates. Provider reads can reflect only what has arrived on the device. Standby normalizes timed events to the local time zone and preserves the provider's all-day dates. Device entries are cached in memory and cleared when you turn the integration off. Local events work in browser development.

## Settings and backup

Settings groups appearance, clock and display, timer, calendar sync, voice reminders, Sanctuary, backup and About. It reuses the persisted clock preferences and provides entry points to the clock gallery, timer controls and Sanctuary library.

**Export backup** creates versioned JSON with categories, task relationships, local calendar events, focus history, in-app reminders and display preferences. Android opens its document picker and browser builds download a file. The export excludes device calendar data and selections, imported media, historical XP, and reminder delivery logs. Restore is unavailable. Keep the exported file private if it includes personal task, event, or reminder text.

## OLED wear mitigation

**OLED Burn-In Prevention** is on by default under Settings → Clock and Display. Every three minutes while visible, it offsets static foreground by up to four CSS pixels. Active gestures and dialogs defer the shift. Sanctuary photos and videos stay fixed.

After 15 minutes without input, Android gradually dims the Standby window. Input, a modal reminder, turning protection off, or leaving the app restores the previous window setting, including system-managed brightness. Browser previews use a pointer-transparent visual dimmer. This reduces burn-in risk and cannot guarantee prevention.

## Visual themes

The document theme sets background, text, accent, surface and focus tokens in `src/themes/index.css`. AMOLED Minimal uses true black with clean surfaces and focus outlines. Dark Fantasy RPG adds bronze, parchment, warm progress bars, and local serif and monospace font stacks.

Use the `theme-panel` class and the `Ornament` component for shared panels and dialogs. The ornament draws the border and corners on a pointer-transparent layer positioned by its host. Optional crests sit along the border. Standby also uses the screen-frame and open clock-bracket variants. Decorations render only in Dark Fantasy RPG. The clock face is still chosen independently, and Fantasy Pixel uses bundled stepped SVG glyphs.

Keep content and controls outside the decorative layer. Panels should stay responsive and use their own scrolling where needed. The widget frame comes from the carousel shell, so widget content is shared across both themes. Physical-device checks remain pending for OLED appearance, safe-area edges and hardware Back.
