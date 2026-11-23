# Development plan

Phases 1–9 establish the working foundation and landscape homepage. Later prompts define the detailed scope of phases 10–14.

1. Project initialization and Android foundation — complete.
2. Core architecture — complete. Router gestures, shared display and timer state, extension registries, theme persistence, versioned storage, reminder interfaces and lifecycle events.
3. Standby homepage — complete. Landscape layout with the clock centered in the left half, a smaller timer beneath it and widgets on the right.
4. Clock faces and long-press gallery — complete. Eight offline faces with persistent format, seconds and accent options.
5. Widget carousel and interaction — complete. Six widgets, persistent management and double-tap expansion.
6. Hierarchical tasks and progress tracking — complete. Fullscreen editor, category management, leaf-based progress, and Dexie v3 migration.
7. Countdown and focus timer interface — complete. Persistent sessions, timer controls, task links and local history.
8. Quest Hub — category-based to-do management. Phase 11 retired the obsolete XP and achievement writers, preserving historical rows.
9. Dark Fantasy RPG theme and AMOLED refinement — complete. Shared ornamental frames, styled panels and galleries, and bundled Fantasy Pixel glyphs.
10. Sanctuary refinement and compact Calendar indicators. Shared persistent selection, local media playback and library controls, and reactive event dots. Physical Android verification remains pending.
11. Foreground voice reminders — complete. Settings management, an offline voice bridge, scheduling and delivery history, a themed overlay, and gamification cleanup.
12. Settings consolidation and read-only Android Calendar Provider integration — implemented. Shared local/device calendar views, stopwatch checks and versioned backup export. Physical Android validation remains pending.
12.1. Automatic OLED mitigation — default-on pixel shifting and inactivity dimming with a single display toggle. Android brightness behavior awaits hardware testing.
13A. Native Android debug deployment — the debug APK builds and Android Back dismisses dialogs before changing pages. The POCO X5 Pro owner confirmed the camera cutout fix, Google Calendar sync, voice reminders, OLED dimming, media persistence and navigation.
13A.1. Mounted display and Sanctuary playback — foreground screen-awake flag, sensor-driven dual landscape with cutout inset updates, and edge-to-edge video Fill with an auto-hiding audio control. The POCO X5 Pro still needs acceptance checks for this update, especially manual sleep, idle dimming while awake, both mounting positions and audio playback. Follow the [debug APK installation and device checklist](../README.md#android).
13B. Phone-to-phone integration — the same APK supports receiver and sender modes. A foreground service carries selected notifications, ringing and Spotify media-session commands over pinned mutual TLS on Wi-Fi. Recovery addressed minimum-SDK lint failures, Wi-Fi reconnect during ringing and best-effort WhatsApp labeling. Two emulators exercised real notification-listener delivery, revocation, restart and simulated mobile ringing. Android instrumentation verifies commands against a controlled media session. The browser suite covers both themes at four landscape sizes and portrait sender setup. Physical Nothing/POCO acceptance, real Spotify and WhatsApp behavior, and extended OEM background reliability remain pending. See the [pairing and acceptance guide](../README.md#phone-connection).
14. Testing, release signing and distribution.

Implementation entry points and foreground scheduling limitations are documented in the [README](../README.md).
