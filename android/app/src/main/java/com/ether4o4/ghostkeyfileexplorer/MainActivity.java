package com.ether4o4.ghostkeyfileexplorer;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enableWallpaperBackground();
        requestAllFilesAccess();
    }

    /**
     * Ghost Key renders as a floating window over the home-screen wallpaper.
     * FLAG_SHOW_WALLPAPER makes the system wallpaper visible behind the
     * transparent parts of the window; the WebView itself is made transparent
     * via capacitor.config (backgroundColor #00000000). Wrapped defensively so a
     * device that doesn't support the flag simply falls back to a dark backdrop.
     */
    private void enableWallpaperBackground() {
        try {
            getWindow().setBackgroundDrawableResource(android.R.color.transparent);
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WALLPAPER);
        } catch (Exception ignored) {
            // Wallpaper-behind not available here; the app stays usable on its own backdrop.
        }
    }

    /**
     * On Android 11+ a real file manager needs All-Files-Access (MANAGE_EXTERNAL_STORAGE),
     * which has no runtime dialog — the user toggles it in system settings. We send them
     * there once if it isn't already granted. No root involved.
     */
    private void requestAllFilesAccess() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return;
        }
        if (Environment.isExternalStorageManager()) {
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception e) {
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
            } catch (Exception ignored) {
                // Settings screen unavailable on this device; media-scoped access still works.
            }
        }
    }
}
