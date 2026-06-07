import { Desktop } from './components/explorer/Desktop';
import { MobileExplorer } from './components/explorer/MobileExplorer';
import { useResponsive } from './hooks/useResponsive';

/**
 * Ghost Key — Dual-Pane File Explorer.
 *
 * Two presentations of the same store-backed two-pane file manager:
 *  - Desktop: a Windows-style shell (draggable / resizable windows, panes
 *    side-by-side) for wide screens.
 *  - Mobile: panes stacked vertically (FROM over TO), full-screen and
 *    touch-first, for phones — where the floating-window / side-by-side layout
 *    is unusable.
 *
 * Real read/write filesystem access (no root): File System Access API on the
 * web, Capacitor Filesystem in the Android APK. Directories are read on demand —
 * no background scanning/indexing.
 */
function App() {
  const { isMobile } = useResponsive();
  return isMobile ? <MobileExplorer /> : <Desktop />;
}

export default App;
