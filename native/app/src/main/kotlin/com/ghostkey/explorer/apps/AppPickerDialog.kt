package com.ghostkey.explorer.apps

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.ghostkey.explorer.theme.LocalLauncherTheme

// Shared multi-select "pick apps" dialog. Used to add apps to the desktop,
// the taskbar, and the Start menu from a single all-apps list.
@Composable
fun AppPickerDialog(
    title: String,
    apps: List<InstalledApp>,
    onConfirm: (List<String>) -> Unit,
    onDismiss: () -> Unit,
) {
    val theme = LocalLauncherTheme.current
    val selected = remember { mutableStateListOf<String>() }
    Dialog(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .width(340.dp)
                .height(500.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(theme.windowSurface)
                .border(1.dp, theme.stroke, RoundedCornerShape(10.dp))
                .padding(16.dp),
        ) {
            Text(title, color = theme.text, fontSize = 16.sp)
            Spacer(Modifier.height(4.dp))
            Text(
                "Tap apps to select, then Add",
                color = theme.textSecondary, fontSize = 11.sp,
            )
            Spacer(Modifier.height(10.dp))
            if (apps.isEmpty()) {
                Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                    Text("Loading…", color = theme.textSecondary, fontSize = 12.sp)
                }
            } else {
                LazyColumn(Modifier.fillMaxWidth().weight(1f)) {
                    items(apps, key = { it.packageName }) { app ->
                        val isSel = selected.contains(app.packageName)
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(4.dp))
                                .clickable {
                                    if (isSel) selected.remove(app.packageName)
                                    else selected.add(app.packageName)
                                }
                                .padding(horizontal = 8.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            if (app.icon != null) {
                                Image(
                                    bitmap = app.icon, contentDescription = null,
                                    modifier = Modifier.size(26.dp),
                                    filterQuality = androidx.compose.ui.graphics.FilterQuality.High,
                                )
                            } else {
                                Box(Modifier.size(26.dp))
                            }
                            Spacer(Modifier.width(12.dp))
                            Text(
                                app.label, color = theme.text, fontSize = 13.sp,
                                maxLines = 1, overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f),
                            )
                            Box(
                                Modifier
                                    .size(20.dp)
                                    .clip(CircleShape)
                                    .background(if (isSel) theme.accent else theme.card)
                                    .border(1.dp, theme.stroke, CircleShape),
                                contentAlignment = Alignment.Center,
                            ) {
                                if (isSel) {
                                    Icon(
                                        Icons.Outlined.Check, null,
                                        Modifier.size(14.dp), tint = theme.accentText,
                                    )
                                }
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(4.dp))
                        .background(if (selected.isEmpty()) theme.card else theme.accent)
                        .clickable {
                            onConfirm(selected.toList())
                            if (selected.isNotEmpty()) onDismiss()
                        }
                        .padding(vertical = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (selected.isEmpty()) "Add" else "Add (${selected.size})",
                        color = if (selected.isEmpty()) theme.textSecondary else theme.accentText,
                        fontSize = 13.sp,
                    )
                }
                Box(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(4.dp))
                        .background(theme.card)
                        .border(1.dp, theme.stroke, RoundedCornerShape(4.dp))
                        .clickable { onDismiss() }
                        .padding(vertical = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Cancel", color = theme.text, fontSize = 13.sp)
                }
            }
        }
    }
}
