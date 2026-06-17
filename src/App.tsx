import { Explorer } from './components/explorer/Explorer';

/**
 * Ghost Key — File Explorer.
 *
 * Not a launcher: opening the app goes straight into a single full-screen file
 * manager with real read/write access to the filesystem (no root) — the File
 * System Access API on the web, Capacitor Filesystem in the Android APK.
 * Directories are read on demand: no background scanning or indexing.
 */
function App() {
  return <Explorer />;
}

export default App;
