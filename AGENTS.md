# Standby

Standby is an offline-first wall-mounted Android productivity dashboard. Use React, strict TypeScript, Vite, React Router, Tailwind CSS, Capacitor, Dexie and local Preferences.

- Preserve the approved immersive landscape layout. Keep the giant clock centered within the left half and the much smaller timer beneath it. Reserve the right half for widgets.
- Keep AMOLED Minimal true black and maintain Dark Fantasy RPG as a distinct theme. Do not redesign approved features without user approval.
- Keep the production Standby screen free of permanent navigation buttons. Preserve swipe order, browser and Android Back, and gesture isolation for widgets and overlays. Open the clock gallery with a long press.
- Keep the app usable offline with bundled assets. Store structured data in Dexie with migrations and lightweight settings in Capacitor Preferences.
- Keep Quest Hub category-based. Preserve separate category progress and leave historical gamification records dormant.
- Reuse existing state, registries, routing and services. Keep dependencies minimal and preserve working behavior.
- After changes run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. Claim checks passed only after running them successfully.
