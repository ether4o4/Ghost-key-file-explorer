import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ether4o4.ghostkeyfileexplorer',
  appName: 'Ghost Key File Explorer',
  webDir: 'dist',
  android: {
    // The in-app "desktop" draws its own window chrome; let the web layer paint
    // edge-to-edge and handle the status/navigation bar via safe-area insets.
    backgroundColor: '#0a0b0e',
  },
};

export default config;
