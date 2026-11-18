package com.ghostkey.explorer.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.ghostkey.explorer.R
import com.ghostkey.explorer.apps.InstalledAppsRepository
import com.ghostkey.explorer.data.AppFolders
import com.ghostkey.explorer.data.FolderItem
import java.io.File

class FolderWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        FolderItemsFactory(applicationContext, intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, 0))
}

private class FolderItemsFactory(private val context: Context, private val widgetId: Int) :
    RemoteViewsService.RemoteViewsFactory {
    private var items: List<FolderItem> = emptyList()

    override fun onCreate() = Unit

    override fun onDataSetChanged() {
        val folderId = WidgetBindings.folderFor(context, widgetId)
        items = AppFolders.load().firstOrNull { it.id == folderId }?.items.orEmpty()
            // Hide apps that were uninstalled
            .filter { it.kind != "app" || InstalledAppsRepository.isInstalled(context, it.value) }
    }

    override fun onDestroy() { items = emptyList() }

    override fun getCount(): Int = items.size

    override fun getViewAt(position: Int): RemoteViews {
        val item = items.getOrNull(position) ?: return RemoteViews(context.packageName, R.layout.widget_folder_item)
        return RemoteViews(context.packageName, R.layout.widget_folder_item).apply {
            setTextViewText(R.id.item_label, item.label)
            if (item.kind == "app") {
                val bmp = InstalledAppsRepository.iconBitmap(context, item.value)
                if (bmp != null) setImageViewBitmap(R.id.item_icon, bmp) else setImageViewResource(R.id.item_icon, R.drawable.ic_file_glyph)
            } else {
                val isDir = File(item.value).isDirectory
                setImageViewResource(R.id.item_icon, if (isDir) R.drawable.ic_folder_glyph else R.drawable.ic_file_glyph)
                if (isDir) setInt(R.id.item_icon, "setColorFilter", 0xFFFFCA28.toInt())
            }
            setOnClickFillInIntent(
                R.id.item_root,
                Intent().putExtra(WidgetLaunchActivity.EXTRA_KIND, item.kind).putExtra(WidgetLaunchActivity.EXTRA_VALUE, item.value),
            )
        }
    }

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 1
    override fun getItemId(position: Int): Long = items.getOrNull(position)?.key?.hashCode()?.toLong() ?: position.toLong()
    override fun hasStableIds(): Boolean = true
}
