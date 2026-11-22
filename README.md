# Standby

Standby is a landscape Android productivity dashboard for a wall-mounted phone. The installed app uses packaged web assets, IndexedDB and native Preferences offline. Phase 2 provides the architecture for the dashboard.

## Development

Use Node 24 and npm. Use JDK 21 for the Android Gradle build. Run `npm ci`, then `npm run dev`. Use `npm test` for timer, task hierarchy and IndexedDB tests, `npm run typecheck` for strict TypeScript, `npm run lint` for linting and `npm run build` for a production bundle. `npm run preview` serves that bundle locally.

## Architecture

- **Navigation** uses React Router with hash URLs. Swipe left to advance through Settings, Standby, Quest Hub, Calendar, Spotify and Sanctuary. Swipe right to return. Each transition adds a history entry. Capacitor App's default Android back handler uses WebView history. The two ends stop.
- **Gestures** use Pointer Events on the page. Recognition requires 60 CSS pixels horizontally and a horizontal displacement at least 1.5 times the vertical displacement. Controls and gestures that start vertically are excluded. Put `data-page-swipe="off"` on any carousel or custom control that owns its own gestures.
- **Shared state** uses separate display and timer contexts. `useDisplay().update(patch)` normalizes changes. Startup loads Preferences before mounting providers. Serialized writes preserve update order. Preferences include theme, clock format, seconds, face, widget and widget order. Unknown IDs fall back to registered defaults. New widgets append to the saved order. The old theme key remains readable.
- **Faces and widgets** register a component under a stable ID in their respective registries under `src/components`. Faces declare compatible themes. Widget capabilities declare optional permission or native dependencies. An empty list denotes an offline widget. Digital and Tasks are the first entries. The clock owns its ticks.
- **Themes** share components and use global CSS tokens selected on the document root. Register a theme in `src/themes/types.ts` and supply its tokens in `index.css`. Settings switches themes immediately.
- **Structured storage** lives in Dexie. Version 2 retains the four original tables and keys, adds timestamps, and migrates reminders to the in-app channel. Legacy records without historical timestamps use migration time. Tasks reference a category and optionally a parent in that category. Use the asynchronous functions in `src/storage/repositories.ts` for categories, tasks and focus sessions.
- **Timers** use `useTimer().dispatch(action)` for start, pause, resume and reset. A running timer stores a wall-clock deadline. A paused timer stores the remaining milliseconds. Completion reconciles on expiry, startup and resume. Manual device-time changes affect a running deadline.
- **Lifecycle and reminders** use Capacitor App events on Android and visibility/pageshow events in browsers. The foreground scheduler observes persisted deadlines and reconciles on resume.

## Android

Install Android Studio and the SDK platform specified in `android/variables.gradle`. Build and copy the assets, then open the native project:

```sh
npm run build
npx cap sync android
npx cap open android
```

Sync Gradle and run on an API 24+ device or emulator. The native activity requests landscape and immersive system bars. Use the mounted phone to check gesture interaction with the system edges, Android Back, and resume after locking the screen.

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

Videos start muted, loop inline, and pause when covered, backgrounded, or left. Use Library to unmute the current video or switch between fit and fill. If autoplay is blocked, tap the playback prompt. No default video is bundled. Formats depend on the installed browser or Android WebView codecs.

Imports use origin-private files where streaming writes are available, with a Dexie Blob fallback. Metadata and selection are stored separately in Dexie. Import limits are 512 MiB for private files and 32 MiB for fallback, subject to available storage. Android WebView playback, app-restart persistence, and system-edge gestures require physical-device testing.

The Calendar agenda, compact widget dots, and Standby today notice combine local events with selected Android calendars. Local events can be edited or deleted in Standby. Device events are labeled read-only and can be opened in a compatible Android calendar app.

### Device calendar setup

1. In Google Calendar or the device's account settings, enable synchronization for the calendars you want on the mounted phone. Confirm those events are visible in the Android calendar app.
2. In Standby, open Settings → Calendar Synchronization and turn on **Show device calendar events**. Grant Android read access and select the calendars to display.
3. Use **Refresh** to read the provider and see the last successful read time. Standby also refreshes on app resume and when you open or browse Calendar.

Standby uses only Android's read-calendar permission and reads bounded ranges of occurrences from the local provider. The Google Calendar app or another sync adapter supplies any cloud updates. Provider reads can reflect only what has arrived on the device. Standby normalizes timed events to the local time zone and preserves the provider's all-day dates. Device entries are cached in memory and cleared when you turn the integration off. Local events work in browser development.

## Settings and backup

Settings groups appearance, clock and display, timer, calendar sync, voice reminders, Sanctuary, backup and About. It reuses the persisted clock preferences and provides entry points to the clock gallery, timer controls and Sanctuary library.

**Export backup** creates versioned JSON with categories, task relationships, local calendar events, focus history, in-app reminders and display preferences. Android opens its document picker and browser builds download a file. The export excludes device calendar data and selections, imported media, historical XP, and reminder delivery logs. Restore is unavailable. Keep the exported file private if it includes personal task, event, or reminder text.

## Visual themes

The document theme sets background, text, accent, surface and focus tokens in `src/themes/index.css`. AMOLED Minimal uses true black with clean surfaces and focus outlines. Dark Fantasy RPG adds bronze, parchment, warm progress bars, and local serif and monospace font stacks.

Use the `theme-panel` class and the `Ornament` component for shared panels and dialogs. The ornament draws the border and corners on a pointer-transparent layer positioned by its host. Optional crests sit along the border. Standby also uses the screen-frame and open clock-bracket variants. Decorations render only in Dark Fantasy RPG. The clock face is still chosen independently, and Fantasy Pixel uses bundled stepped SVG glyphs.

Keep content and controls outside the decorative layer. Panels should stay responsive and use their own scrolling where needed. The widget frame comes from the carousel shell, so widget content is shared across both themes. Physical-device checks remain pending for OLED appearance, safe-area edges and hardware Back.
