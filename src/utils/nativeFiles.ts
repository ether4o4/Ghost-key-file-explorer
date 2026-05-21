import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem, type PermissionStatus } from '@capacitor/filesystem';

export interface NativeFileAccess {
  available: boolean;
  publicStorage?: string;
}

export async function requestNativeFileAccess(): Promise<NativeFileAccess> {
  if (!Capacitor.isNativePlatform()) {
    return { available: true, publicStorage: 'web' };
  }

  let permissions: PermissionStatus;
  try {
    permissions = await Filesystem.checkPermissions();
    if (permissions.publicStorage !== 'granted') {
      permissions = await Filesystem.requestPermissions();
    }
  } catch {
    return { available: false, publicStorage: 'unavailable' };
  }

  return {
    available: permissions.publicStorage === 'granted',
    publicStorage: permissions.publicStorage,
  };
}

export async function listNativeDocuments(path = '') {
  if (!Capacitor.isNativePlatform()) return [];

  try {
    const result = await Filesystem.readdir({
      path,
      directory: Directory.Documents,
    });
    return result.files.map(file => ({
      name: file.name,
      type: file.type,
      uri: file.uri,
      size: file.size ?? 0,
      mtime: file.mtime ?? Date.now(),
    }));
  } catch {
    return [];
  }
}
