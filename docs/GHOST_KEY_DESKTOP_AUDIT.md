# Ghost Key Explorer — desktop audit and foundation milestone

Date: 2026-10-27

## Repository audit

The requested desktop URL,
`https://github.com/ether4o4/Ghost-Key-Desktop-full-version`, currently returns
`Repository not found` through both unauthenticated Git and the connected GitHub
account. It was not substituted with another repository.

The accessible repository,
`https://github.com/ether4o4/Ghost-key-file-explorer`, is a React/Vite +
Capacitor application with a real desktop-oriented shell. It contains:

- `src/components/explorer/*`: draggable, resizable desktop windows and a
  dual-pane explorer.
- `src/core/fs.ts`: on-demand File System Access API and Capacitor filesystem
  adapters with copy, move, rename, delete, import, and folder enumeration.
- `src/store/explorerStore.ts`: window lifecycle, pane navigation, selection,
  sorting, drag/drop transfers, and folder preferences.
- `src/core/db.ts`, `sku.ts`, `timeline.ts`, `limbo.ts`, and `vault.ts`:
  local-first intelligence, SKU linking, timeline, Limbo, and AES-GCM vault
  modules.
- `android/`: Capacitor Android packaging.

The repository is not yet a native Windows desktop application. The current
window frame is rendered in React and the native Windows/Tauri layer described
in the missing desktop repository is not available in this checkout.

## Baseline findings

The original `tsconfig.app.json` included stale React Native screens and an
Expo SQLite database that are not part of the active desktop explorer entry
point. That made the web/desktop build fail before Vite could run. The active
explorer sources themselves lint cleanly after isolation.

## Foundation changes in this branch

Branch: `feature/windows-desktop-foundation`

- Added a persisted `single` / `dual` layout mode to each explorer window.
- Added the required title-bar order:
  `Minimize | Maximize/Restore | Single/Dual Pane | Close`.
- Preserved both pane states while switching layout modes.
- Added double-click on the pane divider to restore a 50/50 split.
- Persisted window bounds and maximized state with off-screen-safe clamping.
- Isolated stale mobile-only sources from the desktop TypeScript build.
- Added a `columns` icon for the layout control.

## Verification

These commands pass from the repository root when dependencies are available:

```text
./node_modules/.bin/tsc -b
./node_modules/.bin/vite build
./node_modules/.bin/eslint src/components/explorer src/core/fs.ts src/store/explorerStore.ts src/components/common src/utils
```

The full-repository ESLint run still reports pre-existing issues in the
deprecated mobile screens, Expo database, and DeepSeek service. Those files
are not reachable from the active desktop entry point and were deliberately
not rewritten as part of this foundation milestone.

## Not yet claimed as complete

The following remain implementation work, not mock-complete features:

- Native Tauri/Rust Windows window management and installer.
- OS-level snap behavior, DPI/multi-monitor restoration, and native Explorer
  drag/drop interop.
- Virtualized large-directory listings and background thumbnails.
- SQLite-backed filesystem SKU identity/history attached to real paths.
- Secure Limbo extraction/repackaging with traversal and ZIP-bomb defenses.
- Transactional transfer journal, pause/cancel, verification, and recovery.
- Durable bundles, encrypted file vault storage, global WHO/WHAT/WHEN/WHERE
  search, and acceptance/performance tests.

The missing desktop repository should be recovered or re-published before
attempting a native merge. Until then, this branch is the safe desktop-facing
foundation in the accessible repository.
