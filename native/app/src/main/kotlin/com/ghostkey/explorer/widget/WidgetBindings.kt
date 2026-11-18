package com.ghostkey.explorer.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.widget.RemoteViews
import com.ghostkey.explorer.MainActivity
import com.ghostkey.explorer.R
import com.ghostkey.explorer.data.AppFolders
import com.ghostkey.explorer.intel.Timeline

// Which app folder each home-screen widget shows, and how widgets are drawn.
// Any number of widgets can be placed; each is bound to one folder (several
// widgets may show the same folder).
object WidgetBindings {
    private const val PREFS = "ghostkey_widgets"
    private const val PENDING_FOLDER = "pending_folder"
    private const val PENDING_AT = "pending_at"
    const val EXTRA_FOLDER_ID = "com.ghostkey.explorer.FOLDER_ID"
    const val EXTRA_OPEN_FOLDER = "com.ghostkey.explorer.OPEN_FOLDER"
    const val EXTRA_OPEN_PATH = "com.ghostkey.explorer.OPEN_PATH"

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun folderFor(c: Context, widgetId: Int): String? = prefs(c).getString("w_$widgetId", null)

    fun bind(c: Context, widgetId: Int, folderId: String) {
        prefs(c).edit().putString("w_$widgetId", folderId).apply()
        update(c, widgetId)
    }

    fun unbind(c: Context, widgetId: Int) = prefs(c).edit().remove("w_$widgetId").apply()

    fun allWidgetIds(c: Context): IntArray =
        AppWidgetManager.getInstance(c).getAppWidgetIds(ComponentName(c, FolderWidgetProvider::class.java))

    fun widgetsFor(c: Context, folderId: String): List<Int> =
        allWidgetIds(c).filter { folderFor(c, it) == folderId }

    /** Remember the folder of an in-app "Add to home screen" while the launcher places it. */
    fun setPending(c: Context, folderId: String) =
        prefs(c).edit().putString(PENDING_FOLDER, folderId).putLong(PENDING_AT, System.currentTimeMillis()).apply()

    /** The pending folder if requested in the last two minutes (consumed on read). */
    fun takePending(c: Context): String? {
        val p = prefs(c)
        val id = p.getString(PENDING_FOLDER, null) ?: return null
        val fresh = System.currentTimeMillis() - p.getLong(PENDING_AT, 0) < 120_000
        p.edit().remove(PENDING_FOLDER).remove(PENDING_AT).apply()
        return id.takeIf { fresh }
    }

    fun refreshAll(c: Context) {
        val ids = allWidgetIds(c)
        if (ids.isEmpty()) return
        ids.forEach { update(c, it) }
        @Suppress("DEPRECATION")
        AppWidgetManager.getInstance(c).notifyAppWidgetViewDataChanged(ids, R.id.widget_grid)
    }

    fun update(c: Context, widgetId: Int) {
        val mgr = AppWidgetManager.getInstance(c)
        mgr.updateAppWidget(widgetId, buildViews(c, widgetId))
        @Suppress("DEPRECATION")
        mgr.notifyAppWidgetViewDataChanged(widgetId, R.id.widget_grid)
    }

    private val immutable = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

    fun buildViews(c: Context, widgetId: Int): RemoteViews {
        val views = RemoteViews(c.packageName, R.layout.widget_folder)
        val folderId = folderFor(c, widgetId)
        val folder = folderId?.let { id -> AppFolders.load().firstOrNull { it.id == id } }

        if (folder == null) {
            views.setInt(R.id.widget_folder_icon, "setColorFilter", 0xFFFFCA28.toInt())
            views.setTextViewText(R.id.widget_title, c.getString(R.string.widget_unassigned))
            views.setTextViewText(R.id.widget_empty, c.getString(R.string.widget_unassigned))
            val config = Intent(c, WidgetConfigActivity::class.java)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                .setData(Uri.parse("ghostkey://widget/config/$widgetId"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val pi = PendingIntent.getActivity(c, widgetId, config, immutable)
            views.setOnClickPendingIntent(R.id.widget_header, pi)
            views.setOnClickPendingIntent(R.id.widget_empty, pi)
            views.setViewVisibility(R.id.widget_grid, android.view.View.GONE)
            return views
        }

        views.setViewVisibility(R.id.widget_grid, android.view.View.VISIBLE)
        views.setTextViewText(R.id.widget_title, folder.name)
        views.setInt(R.id.widget_folder_icon, "setColorFilter", folder.color.toInt())
        val open = Intent(c, MainActivity::class.java)
            .putExtra(EXTRA_OPEN_FOLDER, folder.id)
            .setData(Uri.parse("ghostkey://folder/${folder.id}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        views.setOnClickPendingIntent(R.id.widget_header, PendingIntent.getActivity(c, widgetId, open, immutable))

        val service = Intent(c, FolderWidgetService::class.java)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
        service.data = Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME))
        @Suppress("DEPRECATION")
        views.setRemoteAdapter(R.id.widget_grid, service)
        views.setEmptyView(R.id.widget_grid, R.id.widget_empty)
        views.setTextViewText(R.id.widget_empty, c.getString(R.string.widget_empty))

        // Each item fills in what to launch; the template routes it through
        // an invisible activity (mutable so the fill-in can be merged).
        val template = Intent(c, WidgetLaunchActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
        views.setPendingIntentTemplate(R.id.widget_grid, PendingIntent.getActivity(c, 10_000 + widgetId, template, flags))
        return views
    }

    /** Ask the launcher to place a widget for [folderId]; false if unsupported. */
    fun requestPin(c: Context, folderId: String): Boolean {
        val mgr = AppWidgetManager.getInstance(c)
        if (!mgr.isRequestPinAppWidgetSupported) return false
        setPending(c, folderId)
        val callback = Intent(c, WidgetPinnedReceiver::class.java).putExtra(EXTRA_FOLDER_ID, folderId)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
        val pi = PendingIntent.getBroadcast(c, folderId.hashCode(), callback, flags)
        return mgr.requestPinAppWidget(ComponentName(c, FolderWidgetProvider::class.java), Bundle(), pi)
    }

    fun recordPinned(folderName: String?) =
        Timeline.record("widget_pinned", "Placed \"${folderName ?: "folder"}\" on the home screen")
}
