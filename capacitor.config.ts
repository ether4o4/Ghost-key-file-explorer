import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ether4o4.ghostkeyfileexplorer',
  appName: 'Ghost Key File Explorer',
  webDir: 'dist',
  // Transparent WebView so the floating window sits over the device wallpaper
  // (MainActivity adds FLAG_SHOW_WALLPAPER + a transparent window background).
  backgroundColor: '#00000000',
  android: {
    backgroundColor: '#00000000',
  },
};

export default config;
