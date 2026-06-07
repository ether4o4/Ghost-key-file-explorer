import { Desktop } from './components/explorer/Desktop';

/**
 * Ghost Key — Dual-Pane File Explorer.
 *
 * A Windows-style desktop shell (draggable / minimizeable / resizable windows)
 * hosting a two-pane file manager with real read/write access to the filesystem
 * (no root): the File System Access API on the web, Capacitor Filesystem in the
 * Android APK. Directories are read on demand — no background scanning/indexing.
 */
function App() {
  return <Desktop />;
}

export default App;
