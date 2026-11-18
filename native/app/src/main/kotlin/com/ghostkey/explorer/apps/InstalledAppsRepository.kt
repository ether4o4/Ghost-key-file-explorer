package com.ghostkey.explorer.apps

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.graphics.drawable.toBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class InstalledApp(
    val label: String,
    val packageName: String,
    val icon: ImageBitmap?,
)

// Launchable apps on the device, cached per process (same approach as
// NeverSoft 11's repository, minus icon packs).
object InstalledAppsRepository {
    @Volatile private var cached: List<InstalledApp>? = null
    @Volatile private var cachedAt = 0L
    private val iconMemo = HashMap<String, Bitmap?>()
    private const val TTL = 5 * 60_000L
    const val ICON_PX = 144

    suspend fun loadApps(context: Context, force: Boolean = false): List<InstalledApp> = withContext(Dispatchers.IO) {
        cached?.takeIf { !force && System.currentTimeMillis() - cachedAt < TTL }?.let { return@withContext it }
        val pm = context.packageManager
        val apps = pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
            .filter { it.activityInfo.packageName != context.packageName }
            .map { ri ->
                val pkg = ri.activityInfo.packageName
                InstalledApp(ri.loadLabel(pm).toString(), pkg, iconBitmap(context, pkg)?.asImageBitmap())
            }
            .distinctBy { it.packageName }
            .sortedBy { it.label.lowercase() }
        cached = apps
        cachedAt = System.currentTimeMillis()
        apps
    }

    fun label(context: Context, pkg: String): String? = runCatching {
        val pm = context.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    }.getOrNull()

    fun isInstalled(context: Context, pkg: String) =
        runCatching { context.packageManager.getApplicationInfo(pkg, 0) }.isSuccess

    fun iconBitmap(context: Context, pkg: String): Bitmap? = synchronized(iconMemo) {
        iconMemo.getOrPut(pkg) {
            runCatching { context.packageManager.getApplicationIcon(pkg).toBitmap(ICON_PX, ICON_PX) }.getOrNull()
        }
    }

    fun launch(context: Context, packageName: String): Boolean {
        val intent = context.packageManager.getLaunchIntentForPackage(packageName) ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching { context.startActivity(intent) }.isSuccess
    }

    fun openAppInfo(context: Context, pkg: String) {
        runCatching {
            context.startActivity(
                Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:$pkg"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
    }
}
