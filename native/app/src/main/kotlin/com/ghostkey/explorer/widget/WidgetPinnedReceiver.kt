package com.ghostkey.explorer.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.ghostkey.explorer.data.AppFolders

// The launcher placed a widget we asked for: bind it to its folder.
class WidgetPinnedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        val folderId = intent.getStringExtra(WidgetBindings.EXTRA_FOLDER_ID) ?: return
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return
        WidgetBindings.takePending(context)
        WidgetBindings.bind(context, widgetId, folderId)
        WidgetBindings.recordPinned(AppFolders.get(folderId)?.name)
    }
}
