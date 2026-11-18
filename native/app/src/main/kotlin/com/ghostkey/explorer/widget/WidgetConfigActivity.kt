package com.ghostkey.explorer.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.outlined.CreateNewFolder
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ghostkey.explorer.MainActivity
import com.ghostkey.explorer.data.AppFolders
import com.ghostkey.explorer.data.Settings
import com.ghostkey.explorer.theme.LauncherThemes
import com.ghostkey.explorer.theme.LocalLauncherTheme
import com.ghostkey.explorer.ui.PromptDialog
import com.ghostkey.explorer.ui.SubtleButton

// Shown when a Ghost Key folder widget is placed from the launcher's widget
// list (or reconfigured): pick which app folder it shows.
class WidgetConfigActivity : ComponentActivity() {
    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        setResult(Activity.RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }

        // Placed through "Add to home screen": the folder is already known
        WidgetBindings.takePending(this)?.let { choose(it); return }

        setContent {
            CompositionLocalProvider(LocalLauncherTheme provides LauncherThemes.fromPreset(Settings.themePreset)) {
                ConfigScreen()
            }
        }
    }

    private fun choose(folderId: String) {
        WidgetBindings.bind(this, widgetId, folderId)
        WidgetBindings.recordPinned(AppFolders.get(folderId)?.name)
        setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        finish()
    }

    @Composable
    private fun ConfigScreen() {
        val theme = LocalLauncherTheme.current
        var creating by remember { mutableStateOf(false) }
        val current = remember { WidgetBindings.folderFor(this, widgetId) }
        Box(Modifier.fillMaxSize().clickable(onClick = { finish() }, indication = null, interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }), contentAlignment = Alignment.Center) {
            Column(
                Modifier
                    .width(320.dp)
                    .heightIn(max = 520.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(theme.windowSurface)
                    .border(1.dp, theme.stroke, RoundedCornerShape(8.dp))
                    .clickable(enabled = false) {}
                    .padding(18.dp),
            ) {
                Text("Choose a folder", color = theme.text, fontSize = 16.sp)
                Spacer(Modifier.height(4.dp))
                Text("This widget shows the apps and files in the folder you pick.", color = theme.textSecondary, fontSize = 12.sp)
                Spacer(Modifier.height(12.dp))
                LazyColumn(Modifier.weight(1f, fill = false)) {
                    items(AppFolders.folders, key = { it.id }) { f ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp))
                                .background(if (f.id == current) theme.accent.copy(alpha = 0.18f) else Color.Transparent)
                                .clickable { choose(f.id) }.padding(horizontal = 10.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Filled.Folder, null, Modifier.size(22.dp), tint = Color(f.color))
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(f.name, color = theme.text, fontSize = 13.sp)
                                Text("${f.items.size} items", color = theme.textSecondary, fontSize = 11.sp)
                            }
                        }
                    }
                    item {
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp)).clickable { creating = true }
                                .padding(horizontal = 10.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Outlined.CreateNewFolder, null, Modifier.size(22.dp), tint = theme.accent)
                            Spacer(Modifier.width(12.dp))
                            Text("New app folder…", color = theme.text, fontSize = 13.sp)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                SubtleButton("Cancel", onClick = { finish() }, modifier = Modifier.fillMaxWidth())
            }
        }
        if (creating) {
            PromptDialog(
                title = "New app folder", initial = "New folder", confirm = "Create",
                onConfirm = { name ->
                    val f = AppFolders.create(name)
                    choose(f.id)
                    // Open it so apps can be added right away
                    startActivity(
                        Intent(this, MainActivity::class.java).putExtra(WidgetBindings.EXTRA_OPEN_FOLDER, f.id)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                    )
                },
                onDismiss = { creating = false },
            )
        }
    }
}
