# Standby

Standby is a landscape Android productivity dashboard for a wall-mounted phone. The installed app uses packaged web assets, IndexedDB and native Preferences offline. Phase 2 provides the architecture for the dashboard.

## Development

Use Node 24 and npm. Run `npm ci`, then `npm run dev`. Use `npm test` for timer, task hierarchy and IndexedDB tests, `npm run typecheck` for strict TypeScript, `npm run lint` for linting and `npm run build` for a production bundle. `npm run preview` serves that bundle locally.

## Architecture

- **Navigation** uses React Router with hash URLs. Swipe left to advance through Settings, Standby, Quest Hub and Sanctuary. Swipe right to return. Each transition adds a history entry. Capacitor App's default Android back handler uses WebView history. The two ends stop. Development builds also show route links.
- **Gestures** use Pointer Events on the page. Recognition requires 60 CSS pixels horizontally and a horizontal displacement at least 1.5 times the vertical displacement. Controls and gestures that start vertically are excluded. Put `data-page-swipe="off"` on any carousel or custom control that owns its own gestures.
- **Shared state** uses separate display and timer contexts. `useDisplay().update(patch)` normalizes changes. Startup loads Preferences before mounting providers. Serialized writes preserve update order. Preferences include theme, clock format, seconds, face, widget and widget order. Unknown IDs fall back to registered defaults. New widgets append to the saved order. The old theme key remains readable.
- **Faces and widgets** register a component under a stable ID in their respective registries under `src/components`. Faces declare compatible themes. Widget capabilities declare optional permission or native dependencies. An empty list denotes an offline widget. Digital and Tasks are the first entries. The clock owns its ticks.
- **Themes** share components and use global CSS tokens selected on the document root. Register a theme in `src/themes/types.ts` and supply its tokens in `index.css`. Settings switches themes immediately.
- **Structured storage** lives in Dexie. Version 2 retains the four original tables and keys, adds timestamps, and migrates reminders to the in-app channel. Legacy records without historical timestamps use migration time. Tasks reference a category and optionally a parent in that category. Use the asynchronous functions in `src/storage/repositories.ts` for categories, tasks and focus sessions.
- **Timers** use `useTimer().dispatch(action)` for start, pause, resume and reset. A running timer stores a wall-clock deadline. A paused timer stores the remaining milliseconds. Completion reconciles on expiry, startup and resume. Manual device-time changes affect a running deadline.
- **Lifecycle and reminders** use the Capacitor App event on Android and visibility/pageshow events in browsers. A future foreground presenter can query `inAppReminders.due()` on resume, then acknowledge display with `markDelivered()`. Delivery history stays in IndexedDB. Suspended or closed apps cannot show these in-app reminders until they run again. Native notification delivery is a later milestone.

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

Swipe or drag horizontally in the right pane to change widgets. With the carousel focused, Left and Right do the same. Hold the widget or press G to open management. There you can enable widgets, reorder them, and choose the default used when the saved active widget is unavailable. Double-tap, double-click, or press Enter to expand the active widget. Close, Escape, and Back dismiss the overlay.

Register new widgets in `src/components/widgets/registry.ts` with a stable ID, name, description, capability metadata and component. Display preferences store enabled widgets, order, default and active widget, and the quote index. Tasks, progress, and focus history read local Dexie data. Progress covers all saved tasks, and Tasks shows the selected category, falling back to the first populated category or the first category. Media is a display-only placeholder. Android hardware Back and physical gestures still need device verification.

## Task management

Double-tap Tasks or focus it and press Enter to open its editor. Pick the category shown on Standby, manage category names, accents and order, and add or edit tasks with optional descriptions and due dates. The Parent task and Category fields move entire branches. Use the arrow buttons to reorder siblings.

Only tasks without children count toward progress. A parent is complete when all of its actionable descendants are complete. Checking or reopening a parent applies that state to the whole branch. Percentages are rounded to the nearest integer. Empty categories have no progress bar.

Dexie v3 preserves IDs and repairs broken hierarchy links. Tasks whose category is missing are grouped under Recovered tasks. Category deletion offers a choice to move the tasks or delete them. The latest deletion can be undone until the expanded editor closes. Unsaved forms are discarded on refresh. The active category is stored in Capacitor Preferences. Physical Android testing of the editor, especially the on-screen keyboard and Back, remains pending.

## Focus timer

Tap the countdown to start a session, choose a 15, 25, 45, 60, or 90-minute preset, or enter 1–720 whole minutes. The last valid duration is saved. Closing the panel leaves the session running. Pause stops active time. Finish now records completion with the time actually focused. Cancel records a cancelled session. Reset cancels an active session and clears the display to idle.

A deadline drives the running countdown. Dexie v4 saves timer state and terminal history together, with one record per session ID. An optional task link is for reference and does not affect task completion. The Focus widget shows today's completed count and time using local completion dates. Its expanded view shows the twelve most recent records, including cancelled sessions. A missing task is shown as unavailable. Legacy countdowns are restored where possible, and old records without a planned duration are labelled accordingly.

Suspended JavaScript resumes reconciliation when Standby becomes active, or on the next launch. The foreground completion message is visual. Manual clock changes can make a deadline arrive early or late. Remaining time is clamped to the current running segment's budget, and recorded focus time stays within the planned duration. Physical Android Back and suspension still need device testing.

## Quest Hub

Swipe left from Standby to see objectives, adventurer progress, daily quests, achievements and recent activity. Objectives are the same tasks shown in Standby. Completing an actionable leaf awards 20 XP once per task ID. A completed focus session earns 1 XP per whole active minute, up to 120, with a minimum of one active minute. Cancelled sessions earn no XP. Finishing a category by completing tasks awards 50 XP if new leaf completions have been credited to that category since the last bonus. Reopening, reordering, moving, deleting or restoring tasks never removes earned XP or generates an award on its own.

Level 1 starts at zero. Advancing from level L costs 100 + 50 × (L − 1) XP. Daily quests count three first-time leaf completions, one qualifying completed focus session, and 45 qualifying focus minutes. They reset at local midnight and carry no bonus XP. A streak counts consecutive local dates with first-time leaf completion or qualifying focus activity. Yesterday's streak remains current until today's activity is logged or the day ends.

Achievements unlock for the first, tenth and twenty-fifth leaf completions, the first qualifying focus session, a single session with 60 active minutes, and a three-day streak.

Dexie v5 adds the XP ledger and achievement unlocks. Migration credits previously completed leaves toward lifetime totals without assigning completion dates, so they do not count toward daily quests or streaks. Historical focus receives XP only when explicit completion and elapsed focus time are recorded. We cannot infer past category cycles or tasks that were completed and later reopened. Physical Android scrolling, gestures and Back remain to be tested.

## Visual themes

The document theme sets background, text, accent, surface and focus tokens in `src/themes/index.css`. AMOLED Minimal uses true black with clean surfaces and focus outlines. Dark Fantasy RPG adds bronze, parchment, warm progress bars, and local serif and monospace font stacks.

Use the `theme-panel` class and the `Ornament` component for shared panels and dialogs. The ornament draws the border and corners on a pointer-transparent layer positioned by its host. Optional crests sit along the border. Standby also uses the screen-frame and open clock-bracket variants. Decorations render only in Dark Fantasy RPG. The clock face is still chosen independently, and Fantasy Pixel uses bundled stepped SVG glyphs.

Keep content and controls outside the decorative layer. Panels should stay responsive and use their own scrolling where needed. The widget frame comes from the carousel shell, so widget content is shared across both themes. Physical-device checks remain pending for OLED appearance, safe-area edges and hardware Back.
