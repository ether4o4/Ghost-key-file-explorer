package com.ghostkey.explorer.windows

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.InsertDriveFile
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ghostkey.explorer.apps.AppPickerDialog
import com.ghostkey.explorer.apps.InstalledApp
import com.ghostkey.explorer.apps.InstalledAppsRepository
import com.ghostkey.explorer.data.AppFolders
import com.ghostkey.explorer.data.FolderItem
import com.ghostkey.explorer.drag.FilesPayload
import com.ghostkey.explorer.drag.FolderItemPayload
import com.ghostkey.explorer.drag.dragSource
import com.ghostkey.explorer.drag.dropTarget
import com.ghostkey.explorer.drag.isDropHover
import com.ghostkey.explorer.explorer.fileIcon
import com.ghostkey.explorer.files.FileOpener
import com.ghostkey.explorer.shell.LocalShellActions
import com.ghostkey.explorer.theme.LocalLauncherTheme
import com.ghostkey.explorer.ui.ConfirmDialog
import com.ghostkey.explorer.ui.MenuDivider
import com.ghostkey.explorer.ui.MenuRow
import com.ghostkey.explorer.ui.PromptDialog
import com.ghostkey.explorer.ui.Toasts
import com.ghostkey.explorer.ui.Win11Menu
import com.ghostkey.explorer.widget.WidgetBindings
import com.ghostkey.explorer.window.ShellWindow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

// An app folder, opened from the desktop: a grid of apps and file shortcuts.
// Add apps, drag files in from any explorer window, drag items out onto
// other folders on the desktop, reorder by dropping onto another item, and
// "Add to home screen" to place it as a widget.
@Composable
fun AppFolderWindow(window: ShellWindow) {
    val theme = LocalLauncherTheme.current
    val context = LocalContext.current
    val actions = LocalShellActions.current
    val scope = rememberCoroutineScope()
    val folderId = window.param ?: return
    val folder = AppFolders.folders.firstOrNull { it.id == folderId }
    if (folder == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("This folder was deleted", color = theme.textSecondary, fontSize = 13.sp)
        }
        return
    }
    LaunchedEffect(folder.name) { actions.setWindowTitle(window.id, folder.name) }

    var pickerOpen by remember { mutableStateOf(false) }
    var pickerApps by remember { mutableStateOf<List<InstalledApp>>(emptyList()) }
    var renaming by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var colorMenu by remember { mutableStateOf(false) }
    val widgetCount = remember(folder) { WidgetBindings.widgetsFor(context, folderId).size }

    var icons by remember { mutableStateOf(emptyMap<String, ImageBitmap?>()) }
    LaunchedEffect(folder.items) {
        icons = withContext(Dispatchers.IO) {
            folder.items.filter { it.kind == "app" }.associate { it.value to InstalledAppsRepository.iconBitmap(context, it.value)?.asImageBitmap() }
        }
    }

    Column(Modifier.fillMaxSize()) {
        // Command bar (Win11 style)
        Row(
            Modifier.fillMaxWidth().height(44.dp).horizontalScroll(rememberScrollState()).padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CmdText(Icons.Outlined.Add, "Add apps") {
                pickerOpen = true
                scope.launch { pickerApps = InstalledAppsRepository.loadApps(context) }
            }
            CmdText(Icons.Outlined.Widgets, "Add to home screen") { actions.pinToHomeScreen(folderId) }
            Box(Modifier.padding(horizontal = 6.dp).size(1.dp, 22.dp).background(theme.divider))
            CmdIcon(Icons.Outlined.DriveFileRenameOutline, "Rename") { renaming = true }
            Box {
                CmdIcon(Icons.Outlined.Palette, "Color") { colorMenu = true }
                Win11Menu(colorMenu, { colorMenu = false }) {
                    Row(Modifier.padding(10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        AppFolders.COLORS.forEach { c ->
                            Box(
                                Modifier.size(24.dp).clip(CircleShape).background(Color(c))
                                    .border(2.dp, if (folder.color == c) theme.text else Color.Transparent, CircleShape)
                                    .clickable { AppFolders.setColor(folderId, c); colorMenu = false },
                            )
                        }
                    }
                }
            }
            CmdIcon(Icons.Outlined.Delete, "Delete folder") { confirmDelete = true }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(theme.divider))

        val bgId = "appfolder-${window.id}"
        val bgHover = isDropHover(bgId, 1)
        Box(
            Modifier
                .fillMaxWidth()
                .weight(1f)
                .background(if (bgHover) theme.accent.copy(alpha = 0.08f) else Color.Transparent)
                .dropTarget(
                    bgId, 1,
                    accepts = { p -> p is FilesPayload || (p is FolderItemPayload && p.folderId != folderId) },
                    verb = { p -> if (p is FilesPayload) "Add shortcut to ${folder.name}" else "Move to ${folder.name}" },
                ) { p, _ ->
                    when (p) {
                        is FilesPayload -> AppFolders.addItems(folderId, p.files.map { FolderItem("file", it.absolutePath, it.name) })
                        is FolderItemPayload -> if (p.folderId.isEmpty()) AppFolders.addItems(folderId, listOf(p.item)) else AppFolders.moveItem(p.folderId, folderId, p.item)
                        else -> Unit
                    }
                },
        ) {
            if (folder.items.isEmpty()) {
                Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Icon(Icons.Filled.Folder, null, Modifier.size(54.dp), tint = Color(folder.color))
                    Spacer(Modifier.height(10.dp))
                    Text("This folder is empty", color = theme.text, fontSize = 13.sp)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Tap Add apps, drag apps here from Start, or drag files in from File Explorer.",
                        color = theme.textSecondary, fontSize = 11.sp, textAlign = TextAlign.Center,
                    )
                }
            } else {
                LazyVerticalGrid(GridCells.Adaptive(80.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(8.dp)) {
                    itemsIndexed(folder.items, key = { _, it -> it.key }) { index, item ->
                        FolderItemTile(window.id, folderId, item, index, icons[item.value])
                    }
                }
            }
        }

        Box(Modifier.fillMaxWidth().height(1.dp).background(theme.divider))
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
            Text(
                "${folder.items.size} items   |   " +
                    if (widgetCount == 0) "Not on home screen" else "On home screen ($widgetCount widget${if (widgetCount == 1) "" else "s"})",
                color = theme.textSecondary, fontSize = 11.sp,
            )
        }
    }

    if (pickerOpen) {
        AppPickerDialog(
            title = "Add apps to ${folder.name}",
            apps = pickerApps.filter { a -> folder.items.none { it.kind == "app" && it.value == a.packageName } },
            onConfirm = { pkgs ->
                val byPkg = pickerApps.associateBy { it.packageName }
                AppFolders.addItems(folderId, pkgs.map { FolderItem("app", it, byPkg[it]?.label ?: it) })
                if (pkgs.isNotEmpty()) Toasts.success("Added ${pkgs.size} app(s)")
            },
            onDismiss = { pickerOpen = false },
        )
    }
    if (renaming) PromptDialog("Rename folder", folder.name, onConfirm = { AppFolders.rename(folderId, it) }, onDismiss = { renaming = false })
    if (confirmDelete) ConfirmDialog(
        "Delete \"${folder.name}\"?",
        "The folder and its home-screen widgets go away. Your apps and files are not touched.",
        "Delete",
        onConfirm = { AppFolders.delete(folderId); actions.closeWindow(window.id) },
        onDismiss = { confirmDelete = false },
    )
}

@Composable
private fun FolderItemTile(windowId: String, folderId: String, item: FolderItem, index: Int, icon: ImageBitmap?) {
    val theme = LocalLauncherTheme.current
    val context = LocalContext.current
    val actions = LocalShellActions.current
    var menu by remember { mutableStateOf(false) }
    var moveMenu by remember { mutableStateOf(false) }
    val tileId = "fitem-$windowId-${item.key}"
    val hover = isDropHover(tileId, 2)
    val missing = if (item.kind == "app") !InstalledAppsRepository.isInstalled(context, item.value) else !File(item.value).exists()

    fun open() {
        if (item.kind == "app") {
            if (!InstalledAppsRepository.launch(context, item.value)) Toasts.error("${item.label} isn't installed")
        } else {
            val f = File(item.value)
            when {
                !f.exists() -> Toasts.error("${item.label} was moved or deleted")
                f.isDirectory -> actions.openExplorer(f.absolutePath)
                else -> FileOpener.open(context, f)
            }
        }
    }

    Box {
        Column(
            Modifier
                .padding(3.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(if (hover) theme.accent.copy(alpha = 0.3f) else Color.Transparent)
                // Drop another item here to reorder it to this spot
                .dropTarget(tileId, 2, accepts = { p -> p is FolderItemPayload && p.folderId == folderId && p.item.key != item.key }, verb = { "Place here" }) { p, _ ->
                    if (p is FolderItemPayload) AppFolders.reorder(folderId, p.item, index)
                }
                .dragSource(
                    key = item.key,
                    payload = { FolderItemPayload(folderId, item) },
                    onTap = { open() },
                    onLongPress = { menu = true },
                )
                .padding(vertical = 8.dp, horizontal = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
                when {
                    icon != null -> Image(icon, null, Modifier.size(44.dp))
                    item.kind == "file" && File(item.value).isDirectory -> Icon(Icons.Filled.Folder, null, Modifier.size(42.dp), tint = Color(0xFFFFCA28))
                    item.kind == "file" -> Icon(fileIcon(item.label), null, Modifier.size(36.dp), tint = theme.textSecondary)
                    else -> Icon(Icons.Outlined.Android, null, Modifier.size(36.dp), tint = theme.textSecondary)
                }
                if (item.kind == "file") {
                    Icon(
                        Icons.Outlined.Shortcut, null,
                        Modifier.align(Alignment.BottomStart).size(14.dp).clip(RoundedCornerShape(3.dp)).background(Color.White),
                        tint = Color(0xFF005FB8),
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                item.label, color = if (missing) theme.textDisabled else theme.text, fontSize = 11.sp,
                maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, lineHeight = 13.sp,
            )
        }
        Win11Menu(menu, { menu = false; moveMenu = false }) {
            if (moveMenu) {
                MenuRow(Icons.AutoMirrored.Outlined.InsertDriveFile, "Move to…", enabled = false) {}
                MenuDivider()
                AppFolders.folders.filter { it.id != folderId }.forEach { f ->
                    MenuRow(Icons.Filled.Folder, f.name) { AppFolders.moveItem(folderId, f.id, item); menu = false; moveMenu = false }
                }
            } else {
                MenuRow(Icons.Outlined.OpenInNew, "Open") { menu = false; open() }
                if (item.kind == "app") MenuRow(Icons.Outlined.Info, "App info") { menu = false; InstalledAppsRepository.openAppInfo(context, item.value) }
                if (item.kind == "file") MenuRow(Icons.Outlined.FolderOpen, "Show in File Explorer") {
                    menu = false; actions.openExplorer(File(item.value).parent)
                }
                if (AppFolders.folders.size > 1) MenuRow(Icons.Outlined.DriveFileMove, "Move to folder", submenu = true) { moveMenu = true }
                MenuDivider()
                MenuRow(Icons.Outlined.RemoveCircleOutline, "Remove from folder", danger = true) { menu = false; AppFolders.removeItem(folderId, item) }
            }
        }
    }
}

@Composable
private fun CmdText(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    val theme = LocalLauncherTheme.current
    Row(
        Modifier.clip(RoundedCornerShape(4.dp)).clickable { onClick() }.padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(16.dp), tint = theme.accent)
        Spacer(Modifier.width(6.dp))
        Text(label, color = theme.text, fontSize = 13.sp)
    }
}

@Composable
private fun CmdIcon(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, onClick: () -> Unit) {
    val theme = LocalLauncherTheme.current
    Box(Modifier.size(32.dp).clip(RoundedCornerShape(4.dp)).clickable { onClick() }, contentAlignment = Alignment.Center) {
        Icon(icon, description, Modifier.size(16.dp), tint = theme.text)
    }
}
