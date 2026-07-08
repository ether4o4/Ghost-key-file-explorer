package com.ether4o4.ghostkeyfileexplorer;

import android.app.AppOpsManager;
import android.app.usage.StorageStats;
import android.app.usage.StorageStatsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Lists installed apps with install times, usage (last-used / foreground time)
 * and on-disk size, and exposes uninstall / app-info / launch. Usage + size need
 * the user-granted "Usage access" special permission; everything else works
 * without it. Uninstall fires the system uninstall dialog (no silent removal).
 */
@CapacitorPlugin(name = "AppManager")
public class AppManagerPlugin extends Plugin {

    @PluginMethod
    public void hasUsageAccess(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasUsageStatsPermission());
        call.resolve(ret);
    }

    @PluginMethod
    public void openUsageAccessSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception ignored) {
            // Settings screen unavailable on this device.
        }
        call.resolve();
    }

    @PluginMethod
    public void listApps(PluginCall call) {
        boolean includeSystem = Boolean.TRUE.equals(call.getBoolean("includeSystem", false));
        boolean withIcons = Boolean.TRUE.equals(call.getBoolean("icons", false));
        boolean withSizes = Boolean.TRUE.equals(call.getBoolean("sizes", false));
        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();

        Map<String, UsageStats> usage = queryUsage(ctx);
        StorageStatsManager ssm = null;
        if (withSizes && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && hasUsageStatsPermission()) {
            ssm = (StorageStatsManager) ctx.getSystemService(Context.STORAGE_STATS_SERVICE);
        }

        List<PackageInfo> packages = pm.getInstalledPackages(0);
        JSArray apps = new JSArray();
        for (PackageInfo pi : packages) {
            ApplicationInfo ai = pi.applicationInfo;
            if (ai == null) continue;
            boolean system = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
            boolean updatedSystem = (ai.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0;
            if (system && !updatedSystem && !includeSystem) continue;

            JSObject o = new JSObject();
            o.put("packageName", pi.packageName);
            o.put("appName", String.valueOf(pm.getApplicationLabel(ai)));
            o.put("versionName", pi.versionName == null ? "" : pi.versionName);
            o.put("firstInstallTime", pi.firstInstallTime);
            o.put("lastUpdateTime", pi.lastUpdateTime);
            o.put("system", system);
            o.put("enabled", ai.enabled);
            o.put("launchable", pm.getLaunchIntentForPackage(pi.packageName) != null);

            UsageStats us = usage.get(pi.packageName);
            o.put("lastTimeUsed", us != null ? us.getLastTimeUsed() : 0L);
            o.put("totalTimeForeground", us != null ? us.getTotalTimeInForeground() : 0L);

            long size = -1L;
            if (ssm != null) {
                try {
                    StorageStats stats = ssm.queryStatsForPackage(ai.storageUuid, pi.packageName, Process.myUserHandle());
                    size = stats.getAppBytes() + stats.getDataBytes() + stats.getCacheBytes();
                } catch (Exception ignored) {
                    // Some packages refuse stats; leave as -1 (unknown).
                }
            }
            o.put("sizeBytes", size);

            if (withIcons) {
                try {
                    o.put("icon", drawableToBase64(pm.getApplicationIcon(ai)));
                } catch (Exception ignored) {
                    o.put("icon", "");
                }
            }
            apps.put(o);
        }

        JSObject ret = new JSObject();
        ret.put("apps", apps);
        ret.put("usageAccess", hasUsageStatsPermission());
        call.resolve(ret);
    }

    /** Batched enrichment: icons (and sizes, if usage access) for given packages. */
    @PluginMethod
    public void getDetails(PluginCall call) {
        JSArray arr = call.getArray("packageNames");
        boolean wantIcons = Boolean.TRUE.equals(call.getBoolean("icons", true));
        boolean wantSizes = Boolean.TRUE.equals(call.getBoolean("sizes", false));
        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        StorageStatsManager ssm = null;
        if (wantSizes && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && hasUsageStatsPermission()) {
            ssm = (StorageStatsManager) ctx.getSystemService(Context.STORAGE_STATS_SERVICE);
        }

        JSArray out = new JSArray();
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                String pkg = arr.optString(i, null);
                if (pkg == null || pkg.isEmpty()) continue;
                JSObject o = new JSObject();
                o.put("packageName", pkg);
                try {
                    ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
                    if (wantIcons) {
                        try {
                            o.put("icon", drawableToBase64(pm.getApplicationIcon(ai)));
                        } catch (Exception ignored) {
                            // icon unavailable
                        }
                    }
                    if (ssm != null) {
                        try {
                            StorageStats st = ssm.queryStatsForPackage(ai.storageUuid, pkg, Process.myUserHandle());
                            o.put("sizeBytes", st.getAppBytes() + st.getDataBytes() + st.getCacheBytes());
                        } catch (Exception ignored) {
                            // size unavailable
                        }
                    }
                } catch (Exception ignored) {
                    // package vanished (e.g. just uninstalled) — return bare entry
                }
                out.put(o);
            }
        }

        JSObject ret = new JSObject();
        ret.put("details", out);
        call.resolve(ret);
    }

    @PluginMethod
    public void uninstall(PluginCall call) {
        String pkg = call.getString("packageName");
        if (pkg == null) {
            call.reject("packageName required");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + pkg));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not start uninstall", e);
        }
    }

    @PluginMethod
    public void openAppInfo(PluginCall call) {
        String pkg = call.getString("packageName");
        if (pkg == null) {
            call.reject("packageName required");
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open app info", e);
        }
    }

    @PluginMethod
    public void launchApp(PluginCall call) {
        String pkg = call.getString("packageName");
        if (pkg == null) {
            call.reject("packageName required");
            return;
        }
        Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(pkg);
        if (intent == null) {
            call.reject("App is not launchable");
            return;
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not launch app", e);
        }
    }

    // ── helpers ──

    private boolean hasUsageStatsPermission() {
        try {
            Context ctx = getContext();
            AppOpsManager appOps = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
            int mode;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                mode = appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
            } else {
                mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
            }
            // On many devices the app-op stays MODE_DEFAULT after the user grants
            // Usage Access — fall back to the actual permission grant so we don't
            // keep re-prompting for an access that's already on.
            if (mode == AppOpsManager.MODE_DEFAULT) {
                return ctx.checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED;
            }
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            return false;
        }
    }

    private Map<String, UsageStats> queryUsage(Context ctx) {
        Map<String, UsageStats> map = new HashMap<>();
        if (!hasUsageStatsPermission()) return map;
        try {
            UsageStatsManager usm = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
            long end = System.currentTimeMillis();
            long start = end - 1000L * 60 * 60 * 24 * 365; // last year
            Map<String, UsageStats> agg = usm.queryAndAggregateUsageStats(start, end);
            if (agg != null) map.putAll(agg);
        } catch (Exception ignored) {
            // Usage unavailable; callers fall back to install times.
        }
        return map;
    }

    private String drawableToBase64(Drawable d) {
        int w = d.getIntrinsicWidth();
        int h = d.getIntrinsicHeight();
        if (w <= 0 || h <= 0) {
            w = 96;
            h = 96;
        }
        w = Math.min(w, 96);
        h = Math.min(h, 96);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        d.setBounds(0, 0, w, h);
        d.draw(canvas);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
        bmp.recycle();
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }
}
