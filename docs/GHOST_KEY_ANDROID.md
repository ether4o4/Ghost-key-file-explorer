# Ghost Key Explorer — Android target (course correction)

Date: 2026-10-27

Ghost Key Explorer is an **Android mobile file explorer** (Capacitor + React +
TypeScript + Vite). The "Windows 13" reference describes the *visual design and
in-app window behavior only* — it is not a Windows desktop application. The
project is **not** migrated to Tauri, Rust, or Electron.

- Primary device target: Samsung Galaxy S24 Ultra (ARM64)
- Deliverable: installable Android APK
- App id: `com.ether4o4.ghostkeyfileexplorer`
- Repository: https://github.com/ether4o4/Ghost-key-file-explorer

## Preserved desktop-shell work (reused, not discarded)

Everything from the earlier foundation commit
`e87f17ea814c832ad2e772a2fd6616c08368df51` is kept and adapted for touch:

- Persisted single / dual-pane layout mode.
- Title-bar control order: `Minimize | Maximize/Restore | Single/Dual Pane | Close`.
- Draggable pane divider with double-click 50/50 reset.
- Persisted window geometry with off-screen-safe clamping.

## Android / touch adaptations in this milestone

- Pointer-event window drag/resize/splitter already work for touch; gesture
  surfaces now carry `touch-action: none` and larger finger targets (8 resize
  edges/corners, wider splitter, taller title bar).
- Viewport is `viewport-fit=cover`, zoom disabled, overscroll/callout/tap-
  highlight suppressed so the in-app desktop does not behave like a web page.
- Safe-area insets (status bar / navigation bar / notch) drive the desktop
  padding, window layer top, and taskbar height for portrait and landscape.
- Single-pane mode spans the full window width; dual-pane shows the divider.

## Native filesystem (real, not browser-only)

`src/core/fs.ts` selects the **Capacitor Filesystem** adapter on-device:
`readdir`, `mkdir`, `rename` (move), `copy`, `deleteFile`, `rmdir`,
`writeFile`, plus quick roots for Internal Storage, Download, Documents, DCIM,
Pictures, Movies, Music. `MainActivity` requests All-Files-Access on Android 11+.
The File System Access API path remains only as the desktop-browser dev preview.

## Limbo archive engine (new, functional)

`src/core/archive.ts` performs real ZIP work with the spec's safety rails:

- Extraction into an **isolated** staging workspace (`Directory.Cache/gk-limbo/*`
  on device; OPFS in the browser preview) — never the user's library.
- Path-traversal rejection, absolute-path rejection, entry-count cap,
  uncompressed-size cap, and compression-ratio (ZIP-bomb) detection.
- ZIP headers and declared limits are checked before decompression. The current
  synchronous engine supports ZIP32 stored/deflate entries, with 64 MiB limits
  for the compressed archive and total expanded contents, and 20,000 entries.
  ZIP64, encrypted, split and symlink archives are explicitly unsupported.
- Corrupt sizes/CRC values and colliding normalized paths are rejected. These
  bounds reduce memory risk; they are not a guarantee against device memory
  exhaustion or UI stalls.
- `Repackage & Place`: rebuilds the ZIP, verifies it re-parses and every entry
  round-trips, computes a checksum, and only then writes it into the pane's
  selected destination. Existing destination names are rejected rather than
  overwritten. On placement failure the staging workspace is retained. The
  displayed checksum detects changes; it is not an authenticity signature.

Reachable in-app: right-click a `.zip` → **Open in Limbo**, inspect in the
bottom-right Limbo panel, then right-click a destination folder →
**Repackage & Place here**.

## Build, test, verify

```text
# 1. one-time toolchain (JDK 17 + Android SDK 34 + build-tools 34.0.0)
bash scripts/setup_android_build_env.sh   # from the android-apk-builder skill

# 2. web assets + Capacitor sync + APK
npm run build
npx cap sync android
( cd android && ./gradlew :app:assembleDebug )

# 3. unit tests for the Limbo archive safety rails
npm run test:archive

# 4. verify the APK is real
#   package: com.ether4o4.ghostkeyfileexplorer, signature VALID, launchable
```

Output APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Honest status

Implemented: Android target, touch-adapted window UI, Capacitor filesystem
operations, and Limbo ZIP extraction/repackaging. Host tests, browser checks,
compilation and APK signature checks establish their specific layers only;
they do not establish successful installation or provider access on a phone.

Mutations are serialized within the app, and supported source identities,
destinations and native copy/delete results are checked. Android remains a
path-based backend, not a SAF tree-provider implementation. The available web
and Capacitor operations do not provide a transaction across other apps:
external changes may race operations, and interrupted transfers may leave a
partial destination. Staging uses cache storage, which Android may evict.

Not yet implemented (tracked, not mocked): persistent SKU/Magnetism and
WHO/WHAT/WHEN/WHERE search bound to real on-device paths, the global timeline
and encrypted file vaults wired into the explorer surface, undo/redo + Recycle
Bin, virtualized large-directory lists and background thumbnails, and on-device
instrumented runtime verification (no emulator/`adb` in this sandbox — the APK
is compiled and statically verified, not runtime-verified on hardware).
