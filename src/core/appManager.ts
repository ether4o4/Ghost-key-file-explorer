import { registerPlugin, Capacitor } from '@capacitor/core';

/** One installed app as reported by the native AppManager plugin. */
export interface AppEntry {
  packageName: string;
  appName: string;
  versionName: string;
  firstInstallTime: number; // epoch ms
  lastUpdateTime: number; // epoch ms
  system: boolean;
  enabled: boolean;
  launchable: boolean;
  lastTimeUsed: number; // epoch ms, 0 if unknown/never
  totalTimeForeground: number; // ms
  sizeBytes: number; // -1 if unknown (no usage-access)
  icon?: string; // data: URL, may be empty
}

export interface AppManagerPlugin {
  hasUsageAccess(): Promise<{ granted: boolean }>;
  openUsageAccessSettings(): Promise<void>;
  listApps(options?: { includeSystem?: boolean; icons?: boolean }): Promise<{ apps: AppEntry[]; usageAccess: boolean }>;
  uninstall(options: { packageName: string }): Promise<void>;
  openAppInfo(options: { packageName: string }): Promise<void>;
  launchApp(options: { packageName: string }): Promise<void>;
}

export const AppManager = registerPlugin<AppManagerPlugin>('AppManager');

/** App management is native-only (Android). */
export const appManagerAvailable = (): boolean => Capacitor.isNativePlatform();
