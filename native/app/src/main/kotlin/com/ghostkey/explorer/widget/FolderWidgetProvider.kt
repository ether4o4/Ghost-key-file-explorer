package com.ghostkey.explorer.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import com.ghostkey.explorer.data.AppFolders

// Home-screen widget: one Ghost Key app folder, shown as a grid of apps and
// file shortcuts. Tap an item to launch it, tap the title to open the folder.
class FolderWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { id ->
            // A widget placed from "Add to home screen" on a launcher that
            // doesn't send the pin callback still gets its folder.
            if (WidgetBindings.folderFor(context, id) == null) {
                WidgetBindings.takePending(context)?.let { folderId ->
                    WidgetBindings.bind(context, id, folderId)
                    WidgetBindings.recordPinned(AppFolders.get(folderId)?.name)
                }
            }
            WidgetBindings.update(context, id)
        }
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        ids.forEach { WidgetBindings.unbind(context, it) }
    }
}
