package com.ghostkey.explorer.explorer

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings as AndroidSettings
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.Sort
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ghostkey.explorer.data.AppFolders
import com.ghostkey.explorer.data.FolderItem
import com.ghostkey.explorer.data.FolderPref
import com.ghostkey.explorer.data.FolderPrefs
import com.ghostkey.explorer.data.Settings
import com.ghostkey.explorer.drag.DragPayload
import com.ghostkey.explorer.drag.FilesPayload
import com.ghostkey.explorer.drag.dragSource
import com.ghostkey.explorer.drag.dropTarget
import com.ghostkey.explorer.drag.isDropHover
import com.ghostkey.explorer.files.FileOpener
import com.ghostkey.explorer.files.FileOps
import com.ghostkey.explorer.files.Trash
import com.ghostkey.explorer.intel.FileIndex
import com.ghostkey.explorer.intel.Limbo
import com.ghostkey.explorer.intel.Timeline
import com.ghostkey.explorer.shell.LocalShellActions
import com.ghostkey.explorer.theme.LocalLauncherTheme
import com.ghostkey.explorer.ui.AccentButton
import com.ghostkey.explorer.ui.ConfirmDialog
import com.ghostkey.explorer.ui.MenuDivider
import com.ghostkey.explorer.ui.MenuHeader
import com.ghostkey.explorer.ui.MenuRow
import com.ghostkey.explorer.ui.PromptDialog
import com.ghostkey.explorer.ui.Toasts
import com.ghostkey.explorer.ui.Win11Dialog
import com.ghostkey.explorer.ui.Win11Menu
import com.ghostkey.explorer.window.ShellWindow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

// Bumped after every file operation so every pane, window and the desktop
// re-read what changed.
object FsEvents {
    var tick by mutableIntStateOf(0)
        private set

    fun changed() {
        val main = android.os.Looper.getMainLooper()
        if (android.os.Looper.myLooper() == main) tick++ else android.os.Handler(main).post { tick++ }
    }
}

private sealed interface Prompt {
    data class Rename(val file: File) : Prompt
    data class NewFolder(val dir: File) : Prompt
    data class NewAppFolder(val files: List<File>) : Prompt
    data class Customize(val dir: File) : Prompt
    data class Repackage(val dir: File) : Prompt
    data object EmptyBin : Prompt
}

/** Run a file operation off the main thread, then refresh and report. */
private fun launchOp(
    scope: kotlinx.coroutines.CoroutineScope,
    success: (Int) -> String,
    op: () -> FileOps.Outcome,
) {
    scope.launch {
        val outcome = withContext(Dispatchers.IO) { runCatching(op).getOrElse { FileOps.Outcome(0, 1, it.message) } }
        FsEvents.changed()
        when {
            outcome.failed > 0 -> Toasts.error(outcome.message)
            outcome.done > 0 -> Toasts.success(success(outcome.done))
        }
    }
}

private fun plural(n: Int, word: String = "item") = if (n == 1) "1 $word" else "$n ${word}s"

// Windows 11 File Explorer (NeverSoft 11 layout) with Ghost Key's engine:
// command bar, breadcrumb address bar, navigation pane, details/grid list,
// status bar, Recycle Bin — plus dual panes, multi-select, sort, search,
// tags, Limbo, vaults, app folders and drag & drop.
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FileExplorerWindow(window: ShellWindow) {
    val theme = LocalLauncherTheme.current
    val context = LocalContext.current
    val actions = LocalShellActions.current
    val scope = rememberCoroutineScope()
    val home = remember { Environment.getExternalStorageDirectory() }

    val left = remember { PaneState(window.param?.let { File(it) } ?: home) }
    val right = remember { PaneState(home) }
    var focusRight by remember { mutableStateOf(false) }
    var dualState by remember { mutableStateOf<Boolean?>(null) }
    var sidebarState by remember { mutableStateOf<Boolean?>(null) }
    var split by remember { mutableFloatStateOf(0.5f) }
    var prompt by remember { mutableStateOf<Prompt?>(null) }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = maxWidth >= 560.dp
        val dual = dualState ?: (Settings.dualPaneDefault && wide)
        val showSidebar = sidebarState ?: (maxWidth >= 340.dp && !(dual && !wide))
        val active = if (dual && focusRight) right else left
        val other = if (active === left) right else left

        LaunchedEffect(active.currentDir) {
            val d = active.currentDir
            val title = when {
                Trash.isTrash(d) -> "Recycle Bin"
                d.absolutePath == "/storage" -> "This PC"
                d.absolutePath == home.absolutePath -> "Home"
                Limbo.isInside(d) -> "Limbo"
                else -> volumeDisplayName(d) ?: d.name
            }
            actions.setWindowTitle(window.id, title)
        }

        val selectedFiles: List<File> = active.selection.map { File(it) }.filter { it.exists() }
        val clip = ExplorerClipboard.files

        fun paste(into: File) = launchOp(scope, { "Pasted ${plural(it)}" }) {
            val r = FileOps.transfer(ExplorerClipboard.files, into, copy = !ExplorerClipboard.isCut)
            if (ExplorerClipboard.isCut && r.failed == 0) ExplorerClipboard.clear()
            r
        }

        fun deleteSelected() {
            val files = selectedFiles
            if (files.isEmpty()) return
            active.selection = emptySet()
            launchOp(scope, { "Moved ${plural(it)} to the Recycle Bin" }) { FileOps.delete(files) }
        }

        fun openLimbo(file: File) {
            scope.launch {
                Toasts.show("Extracting \"${file.name}\" into Limbo…")
                val r = withContext(Dispatchers.IO) { runCatching { Limbo.open(file) } }
                r.onSuccess {
                    Toasts.success("Limbo ready: ${it.fileCount} file(s), ${formatSize(it.totalBytes)} staged")
                    actions.openLimbo()
                }.onFailure { Toasts.error(it.message ?: "Limbo extraction failed") }
            }
        }

        val paneOps = PaneOps(
            onOpen = { pane, f ->
                if (f.isDirectory) pane.navigate(f) else FileOpener.open(context, f)
            },
            onOpenNewWindow = { f -> actions.openExplorer(f.absolutePath, newWindow = true) },
            onOpenOtherPane = { pane, f ->
                val target = if (pane === left) right else left
                target.navigate(f)
                dualState = true
                focusRight = target === right
            },
            onRename = { prompt = Prompt.Rename(it) },
            onDelete = { pane, files ->
                pane.selection = emptySet()
                launchOp(scope, { "Moved ${plural(it)} to the Recycle Bin" }) { FileOps.delete(files) }
            },
            onCopyToOther = { pane, files, copy ->
                val dest = (if (pane === left) right else left).currentDir
                launchOp(scope, { "${if (copy) "Copied" else "Moved"} ${plural(it)} to ${dest.name}" }) {
                    FileOps.transfer(files, dest, copy)
                }
            },
            onPaste = { paste(it) },
            onNewFolder = { prompt = Prompt.NewFolder(it) },
            onNewText = { dir ->
                FileOps.newTextFile(dir).onSuccess { FsEvents.changed(); prompt = Prompt.Rename(it) }
                    .onFailure { Toasts.error(it.message ?: "Couldn't create file") }
            },
            onAddToFolder = { folderId, files ->
                AppFolders.addItems(folderId, files.map { FolderItem("file", it.absolutePath, it.name) })
                Toasts.success("Added ${plural(files.size)} to \"${AppFolders.get(folderId)?.name}\"")
            },
            onNewAppFolder = { files -> prompt = Prompt.NewAppFolder(files) },
            onCustomize = { prompt = Prompt.Customize(it) },
            onInspect = { actions.openInspector(it.absolutePath) },
            onLimbo = { openLimbo(it) },
            onVault = { actions.openVaults(it.absolutePath) },
            onRepackage = { prompt = Prompt.Repackage(it) },
            onShare = { FileOpener.share(context, it) },
            onDrop = { pane, dest, payload ->
                if (payload is FilesPayload) {
                    val copy = Settings.dragCopies
                    if (Trash.isTrash(dest)) {
                        launchOp(scope, { "Moved ${plural(it)} to the Recycle Bin" }) { FileOps.delete(payload.files) }
                    } else {
                        launchOp(scope, { "${if (copy) "Copied" else "Moved"} ${plural(it)} to ${dest.name.ifEmpty { "storage" }}" }) {
                            FileOps.transfer(payload.files, dest, copy)
                        }
                    }
                    pane.selection = emptySet()
                }
            },
            onEmptyBin = { prompt = Prompt.EmptyBin },
        )

        Column(Modifier.fillMaxSize()) {
            // ————— Command bar —————
            CommandBar(
                pane = active,
                selectedFiles = selectedFiles,
                hasClipboard = clip.isNotEmpty(),
                dual = dual,
                showSidebar = showSidebar,
                onNewFolder = { prompt = Prompt.NewFolder(active.currentDir) },
                onNewText = { paneOps.onNewText(active.currentDir) },
                onNewAppFolder = { prompt = Prompt.NewAppFolder(emptyList()) },
                onCut = { ExplorerClipboard.set(selectedFiles, cut = true); Toasts.show("Cut ${plural(selectedFiles.size)}") },
                onCopy = { ExplorerClipboard.set(selectedFiles, cut = false); Toasts.show("Copied ${plural(selectedFiles.size)}") },
                onPaste = { paste(active.currentDir) },
                onRename = { selectedFiles.singleOrNull()?.let { prompt = Prompt.Rename(it) } },
                onShare = { FileOpener.share(context, selectedFiles) },
                onDelete = { deleteSelected() },
                onToggleDual = { dualState = !dual; if (!dual) focusRight = false },
                onToggleSidebar = { sidebarState = !showSidebar },
                paneOps = paneOps,
                otherPane = if (dual) other else null,
                trashRefresh = { FsEvents.changed() },
            )
            Box(Modifier.fillMaxWidth().height(1.dp).background(theme.divider))

            Row(Modifier.fillMaxWidth().weight(1f)) {
                if (showSidebar) {
                    Sidebar(windowId = window.id, pane = active, home = home, onDrop = paneOps.onDrop)
                    Box(Modifier.width(1.dp).fillMaxHeight().background(theme.divider))
                }
                Box(Modifier.weight(1f).fillMaxHeight()) {
                    if (!dual) {
                        PaneView(window.id, "L", left, true, home, paneOps, Modifier.fillMaxSize()) {}
                    } else {
                        BoxWithConstraints(Modifier.fillMaxSize()) {
                            val vertical = maxWidth < 520.dp
                            val total = if (vertical) maxHeight else maxWidth
                            val density = LocalDensity.current
                            val totalPx = with(density) { total.toPx() }
                            val first = (total - 8.dp) * split
                            val second = total - 8.dp - first
                            val splitter = Modifier.pointerInput(vertical) {
                                detectDragGestures { change, drag ->
                                    change.consume()
                                    val d = if (vertical) drag.y else drag.x
                                    split = (split + d / totalPx).coerceIn(0.2f, 0.8f)
                                }
                            }.pointerInput(Unit) { detectTapGestures(onDoubleTap = { split = 0.5f }) }
                            if (vertical) {
                                Column(Modifier.fillMaxSize()) {
                                    PaneView(window.id, "L", left, !focusRight, home, paneOps, Modifier.fillMaxWidth().height(first)) { focusRight = false }
                                    SplitterHandle(vertical = true, modifier = splitter.fillMaxWidth().height(8.dp))
                                    PaneView(window.id, "R", right, focusRight, home, paneOps, Modifier.fillMaxWidth().height(second)) { focusRight = true }
                                }
                            } else {
                                Row(Modifier.fillMaxSize()) {
                                    PaneView(window.id, "L", left, !focusRight, home, paneOps, Modifier.fillMaxHeight().width(first)) { focusRight = false }
                                    SplitterHandle(vertical = false, modifier = splitter.fillMaxHeight().width(8.dp))
                                    PaneView(window.id, "R", right, focusRight, home, paneOps, Modifier.fillMaxHeight().width(second)) { focusRight = true }
                                }
                            }
                        }
                    }
                }
            }

            // ————— Status bar —————
            Box(Modifier.fillMaxWidth().height(1.dp).background(theme.divider))
            StatusBar(active, clip.size, ExplorerClipboard.isCut)
        }
    }

    // ————— Dialogs —————
    when (val p = prompt) {
        is Prompt.Rename -> PromptDialog(
            title = "Rename", initial = p.file.name,
            onConfirm = { name ->
                FileOps.rename(p.file, name)
                    .onSuccess { left.selection = emptySet(); right.selection = emptySet(); FsEvents.changed() }
                    .onFailure { Toasts.error(it.message ?: "Rename failed") }
            },
            onDismiss = { prompt = null },
        )
        is Prompt.NewFolder -> PromptDialog(
            title = "New folder", initial = "New folder", confirm = "Create",
            onConfirm = { name ->
                FileOps.newFolder(p.dir, name).onSuccess { FsEvents.changed() }
                    .onFailure { Toasts.error(it.message ?: "Couldn't create folder") }
            },
            onDismiss = { prompt = null },
        )
        is Prompt.NewAppFolder -> PromptDialog(
            title = "New app folder", initial = "New folder", confirm = "Create",
            message = "App folders hold apps and file shortcuts, and can be placed on your home screen as a widget.",
            onConfirm = { name ->
                val f = AppFolders.create(name)
                if (p.files.isNotEmpty()) {
                    AppFolders.addItems(f.id, p.files.map { FolderItem("file", it.absolutePath, it.name) })
                }
                actions.openAppFolder(f.id)
            },
            onDismiss = { prompt = null },
        )
        is Prompt.Customize -> CustomizeFolderDialog(p.dir) { prompt = null }
        is Prompt.Repackage -> {
            val ws = Limbo.workspace
            if (ws == null) prompt = null else PromptDialog(
                title = "Repackage & place here", initial = ws.archiveName, confirm = "Place",
                message = "Rebuilds the Limbo workspace into a ZIP, verifies every entry, then saves it in \"${p.dir.name}\".",
                onConfirm = { name ->
                    scope.launch {
                        withContext(Dispatchers.IO) { runCatching { Limbo.repackagePlace(p.dir, name) } }
                            .onSuccess { FsEvents.changed(); Toasts.success("Placed \"${it.name}\" (verified)") }
                            .onFailure { Toasts.error(it.message ?: "Repackage failed — archive not placed") }
                    }
                },
                onDismiss = { prompt = null },
            )
        }
        Prompt.EmptyBin -> ConfirmDialog(
            title = "Empty Recycle Bin",
            message = "Permanently delete everything in the Recycle Bin? This can't be undone.",
            confirm = "Empty",
            onConfirm = {
                scope.launch {
                    withContext(Dispatchers.IO) { Trash.empty() }
                    FsEvents.changed()
                    Toasts.success("Recycle Bin emptied")
                }
            },
            onDismiss = { prompt = null },
        )
        null -> Unit
    }
}

// Everything a pane can ask its window to do.
private class PaneOps(
    val onOpen: (PaneState, File) -> Unit,
    val onOpenNewWindow: (File) -> Unit,
    val onOpenOtherPane: (PaneState, File) -> Unit,
    val onRename: (File) -> Unit,
    val onDelete: (PaneState, List<File>) -> Unit,
    val onCopyToOther: (PaneState, List<File>, Boolean) -> Unit,
    val onPaste: (File) -> Unit,
    val onNewFolder: (File) -> Unit,
    val onNewText: (File) -> Unit,
    val onAddToFolder: (String, List<File>) -> Unit,
    val onNewAppFolder: (List<File>) -> Unit,
    val onCustomize: (File) -> Unit,
    val onInspect: (File) -> Unit,
    val onLimbo: (File) -> Unit,
    val onVault: (File) -> Unit,
    val onRepackage: (File) -> Unit,
    val onShare: (List<File>) -> Unit,
    val onDrop: (PaneState, File, DragPayload) -> Unit,
    val onEmptyBin: () -> Unit,
)

private fun acceptsInto(dest: File): (DragPayload) -> Boolean = { p ->
    p is FilesPayload && p.files.none { src ->
        src.absolutePath == dest.absolutePath ||
            (src.isDirectory && dest.absolutePath.startsWith(src.absolutePath + "/"))
    } && !(p.files.all { it.parentFile?.absolutePath == dest.absolutePath })
}

private fun verbFor(dest: File, name: String): (DragPayload) -> String = {
    if (Trash.isTrash(dest)) "Delete" else "${if (Settings.dragCopies) "Copy" else "Move"} to $name"
}

// ————————————————————————— Command bar —————————————————————————

@Composable
private fun CommandBar(
    pane: PaneState,
    selectedFiles: List<File>,
    hasClipboard: Boolean,
    dual: Boolean,
    showSidebar: Boolean,
    onNewFolder: () -> Unit,
    onNewText: () -> Unit,
    onNewAppFolder: () -> Unit,
    onCut: () -> Unit,
    onCopy: () -> Unit,
    onPaste: () -> Unit,
    onRename: () -> Unit,
    onShare: () -> Unit,
    onDelete: () -> Unit,
    onToggleDual: () -> Unit,
    onToggleSidebar: () -> Unit,
    paneOps: PaneOps,
    otherPane: PaneState?,
    trashRefresh: () -> Unit,
) {
    val theme = LocalLauncherTheme.current
    val hasSel = selectedFiles.isNotEmpty()
    var newMenu by remember { mutableStateOf(false) }
    var sortMenu by remember { mutableStateOf(false) }
    var viewMenu by remember { mutableStateOf(false) }
    var moreMenu by remember { mutableStateOf(false) }

    Row(
        Modifier.fillMaxWidth().height(44.dp).horizontalScroll(rememberScrollState()).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (pane.inTrash) {
            val entries = remember(pane.refreshTick, FsEvents.tick) { Trash.listEntries() }
            val chosen = entries.filter { it.file.absolutePath in pane.selection }
            CommandText(Icons.Outlined.RestoreFromTrash, "Restore", enabled = chosen.isNotEmpty()) {
                val n = chosen.count { Trash.restore(it) }
                chosen.forEach { Timeline.record("file_restored", "Restored \"${it.displayName}\"", it.originalPath) }
                pane.selection = emptySet()
                trashRefresh()
                if (n > 0) Toasts.success("Restored ${plural(n)}")
            }
            CommandIcon(Icons.Outlined.Delete, "Delete permanently", enabled = chosen.isNotEmpty()) {
                chosen.forEach { Trash.deletePermanently(it) }
                pane.selection = emptySet()
                trashRefresh()
            }
            Spacer(Modifier.width(12.dp))
            if (entries.isNotEmpty()) {
                Text(
                    "Empty Recycle Bin", color = theme.accent, fontSize = 12.sp,
                    modifier = Modifier.clip(RoundedCornerShape(4.dp)).clickable { paneOps.onEmptyBin() }
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                )
            }
            return@Row
        }

        Box {
            CommandText(Icons.Outlined.Add, "New", enabled = true, accentIcon = true) { newMenu = true }
            Win11Menu(newMenu, { newMenu = false }) {
                MenuRow(Icons.Outlined.CreateNewFolder, "Folder") { newMenu = false; onNewFolder() }
                MenuRow(Icons.Outlined.Description, "Text document") { newMenu = false; onNewText() }
                MenuDivider()
                MenuRow(Icons.Outlined.Apps, "App folder (home screen)") { newMenu = false; onNewAppFolder() }
            }
        }
        Box(Modifier.padding(horizontal = 8.dp).size(1.dp, 22.dp).background(theme.divider))
        CommandIcon(Icons.Outlined.ContentCut, "Cut", enabled = hasSel, onClick = onCut)
        CommandIcon(Icons.Outlined.ContentCopy, "Copy", enabled = hasSel, onClick = onCopy)
        CommandIcon(Icons.Outlined.ContentPaste, "Paste", enabled = hasClipboard, onClick = onPaste)
        CommandIcon(Icons.Outlined.DriveFileRenameOutline, "Rename", enabled = selectedFiles.size == 1, onClick = onRename)
        CommandIcon(Icons.Outlined.Share, "Share", enabled = selectedFiles.any { it.isFile }, onClick = onShare)
        CommandIcon(Icons.Outlined.Delete, "Delete", enabled = hasSel, onClick = onDelete)
        Box(Modifier.padding(horizontal = 6.dp).size(1.dp, 22.dp).background(theme.divider))
        Box {
            CommandIcon(Icons.AutoMirrored.Outlined.Sort, "Sort", enabled = true) { sortMenu = true }
            Win11Menu(sortMenu, { sortMenu = false }) {
                MenuHeader("Sort by")
                SortKey.entries.forEach { k ->
                    MenuRow(null, k.label, checked = pane.sortKey == k) { pane.sortKey = k; sortMenu = false }
                }
                MenuDivider()
                MenuRow(null, "Ascending", checked = pane.sortAsc) { pane.sortAsc = true; sortMenu = false }
                MenuRow(null, "Descending", checked = !pane.sortAsc) { pane.sortAsc = false; sortMenu = false }
            }
        }
        Box {
            CommandIcon(if (pane.view == ViewMode.LIST) Icons.Outlined.ViewList else Icons.Outlined.GridView, "View", enabled = true) { viewMenu = true }
            Win11Menu(viewMenu, { viewMenu = false }) {
                MenuHeader("Layout")
                MenuRow(Icons.Outlined.ViewList, "Details", checked = pane.view == ViewMode.LIST) { pane.view = ViewMode.LIST; viewMenu = false }
                MenuRow(Icons.Outlined.GridView, "Large icons", checked = pane.view == ViewMode.GRID) { pane.view = ViewMode.GRID; viewMenu = false }
                MenuDivider()
                MenuHeader("Show")
                MenuRow(Icons.Outlined.ViewColumn, "Dual pane", checked = dual) { onToggleDual(); viewMenu = false }
                MenuRow(Icons.Outlined.ViewSidebar, "Navigation pane", checked = showSidebar) { onToggleSidebar(); viewMenu = false }
                MenuRow(Icons.Outlined.VisibilityOff, "Hidden items", checked = Settings.showHidden) {
                    Settings.updateShowHidden(!Settings.showHidden); viewMenu = false
                }
                MenuRow(Icons.Outlined.ContentCopy, "Drag & drop copies", checked = Settings.dragCopies) {
                    Settings.updateDragCopies(!Settings.dragCopies); viewMenu = false
                }
            }
        }
        Box {
            CommandIcon(Icons.Outlined.MoreHoriz, "See more", enabled = true) { moreMenu = true }
            Win11Menu(moreMenu, { moreMenu = false }) {
                MoreMenuItems(pane, selectedFiles, otherPane, paneOps) { moreMenu = false }
            }
        }
    }
}

@Composable
private fun MoreMenuItems(
    pane: PaneState,
    selected: List<File>,
    otherPane: PaneState?,
    ops: PaneOps,
    close: () -> Unit,
) {
    var page by remember { mutableIntStateOf(0) }
    if (page == 1) {
        AddToFolderMenu(selected, ops, back = { page = 0 }, close = close)
        return
    }
    val single = selected.singleOrNull()
    MenuRow(Icons.Outlined.SelectAll, "Select all") {
        pane.selection = (pane.currentDir.listFiles()?.filter { Settings.showHidden || !it.name.startsWith(".") }
            ?.map { it.absolutePath } ?: emptyList()).toSet()
        close()
    }
    MenuRow(Icons.Outlined.Deselect, "Select none", enabled = selected.isNotEmpty()) { pane.selection = emptySet(); close() }
    MenuDivider()
    MenuRow(Icons.Outlined.Sell, "Properties & tags", enabled = single != null) { single?.let(ops.onInspect); close() }
    MenuRow(Icons.Outlined.Apps, "Add to app folder", enabled = selected.isNotEmpty(), submenu = true) { page = 1 }
    MenuRow(Icons.Outlined.Lock, "Add to vault", enabled = single?.isFile == true) { single?.let(ops.onVault); close() }
    MenuRow(Icons.Outlined.Science, "Open in Limbo", enabled = single?.extension?.equals("zip", true) == true) {
        single?.let(ops.onLimbo); close()
    }
    if (Limbo.workspace != null) {
        MenuRow(Icons.Outlined.Inventory2, "Repackage & place here") { ops.onRepackage(pane.currentDir); close() }
    }
    if (otherPane != null) {
        MenuDivider()
        MenuRow(Icons.Outlined.ContentCopy, "Copy to other pane", enabled = selected.isNotEmpty()) {
            ops.onCopyToOther(pane, selected, true); close()
        }
        MenuRow(Icons.Outlined.DriveFileMove, "Move to other pane", enabled = selected.isNotEmpty()) {
            ops.onCopyToOther(pane, selected, false); close()
        }
    }
}

@Composable
private fun AddToFolderMenu(files: List<File>, ops: PaneOps, back: () -> Unit, close: () -> Unit) {
    MenuRow(Icons.AutoMirrored.Outlined.ArrowBack, "Back") { back() }
    MenuDivider()
    AppFolders.folders.forEach { f ->
        MenuRow(Icons.Filled.Folder, f.name) { ops.onAddToFolder(f.id, files); close() }
    }
    MenuRow(Icons.Outlined.CreateNewFolder, "New app folder…") { ops.onNewAppFolder(files); close() }
}

@Composable
private fun CommandText(
    icon: ImageVector,
    label: String,
    enabled: Boolean,
    accentIcon: Boolean = false,
    onClick: () -> Unit,
) {
    val theme = LocalLauncherTheme.current
    Row(
        Modifier.clip(RoundedCornerShape(4.dp)).clickable(enabled = enabled) { onClick() }
            .padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(16.dp), tint = if (!enabled) theme.textDisabled else if (accentIcon) theme.accent else theme.accent)
        Spacer(Modifier.width(6.dp))
        Text(label, color = if (enabled) theme.text else theme.textDisabled, fontSize = 13.sp)
    }
}

@Composable
private fun CommandIcon(icon: ImageVector, description: String, enabled: Boolean, onClick: () -> Unit) {
    val theme = LocalLauncherTheme.current
    Box(
        Modifier.size(32.dp).clip(RoundedCornerShape(4.dp)).clickable(enabled = enabled) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, description, Modifier.size(16.dp), tint = if (enabled) theme.text else theme.textDisabled)
    }
}

// ————————————————————————— Sidebar —————————————————————————

@Composable
private fun Sidebar(windowId: String, pane: PaneState, home: File, onDrop: (PaneState, File, DragPayload) -> Unit) {
    val theme = LocalLauncherTheme.current
    val pub = { type: String -> Environment.getExternalStoragePublicDirectory(type) }
    Column(
        Modifier.width(132.dp).fillMaxHeight().verticalScroll(rememberScrollState()).padding(vertical = 6.dp, horizontal = 5.dp),
    ) {
        @Composable
        fun item(label: String, icon: ImageVector, dir: File, selected: Boolean, tint: Color? = null) {
            SidebarItem(windowId, label, icon, dir, selected, tint, onClick = { pane.navigate(dir) }) { p -> onDrop(pane, dir, p) }
        }
        item("Home", Icons.Outlined.Home, home, pane.currentDir == home)
        item("Desktop", Icons.Outlined.DesktopWindows, FileOps.desktopDir(), pane.currentDir.absolutePath == FileOps.desktopDir().absolutePath)
        item("Downloads", Icons.Outlined.Download, pub(Environment.DIRECTORY_DOWNLOADS), pane.currentDir.name == "Download")
        item("Documents", Icons.Outlined.Description, pub(Environment.DIRECTORY_DOCUMENTS), pane.currentDir.name == "Documents")
        item("Pictures", Icons.Outlined.Image, pub(Environment.DIRECTORY_PICTURES), pane.currentDir.name == "Pictures")
        item("Camera", Icons.Outlined.PhotoCamera, pub(Environment.DIRECTORY_DCIM), pane.currentDir.name == "DCIM")
        item("Music", Icons.Outlined.MusicNote, pub(Environment.DIRECTORY_MUSIC), pane.currentDir.name == "Music")
        item("Videos", Icons.Outlined.VideoLibrary, pub(Environment.DIRECTORY_MOVIES), pane.currentDir.name == "Movies")
        Box(Modifier.fillMaxWidth().padding(vertical = 5.dp).height(1.dp).background(theme.divider))
        item("This PC", Icons.Outlined.Computer, File("/storage"), pane.currentDir.absolutePath == "/storage")
        item("Recycle Bin", Icons.Outlined.Delete, Trash.dir(), pane.inTrash)
        Limbo.workspace?.let { ws ->
            item("Limbo", Icons.Outlined.Science, ws.dir, Limbo.isInside(pane.currentDir), tint = Color(0xFFFF6B35))
        }
    }
}

@Composable
private fun SidebarItem(
    windowId: String,
    label: String,
    icon: ImageVector,
    dir: File,
    selected: Boolean,
    tint: Color?,
    onClick: () -> Unit,
    onDrop: (DragPayload) -> Unit,
) {
    val theme = LocalLauncherTheme.current
    val targetId = "side-$windowId-${dir.absolutePath}"
    val hover = isDropHover(targetId, 4)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(4.dp))
            .background(
                when {
                    hover -> theme.accent.copy(alpha = 0.28f)
                    selected -> theme.hover
                    else -> Color.Transparent
                },
            )
            .dropTarget(targetId, 4, accepts = acceptsInto(dir), verb = verbFor(dir, label)) { p, _ -> onDrop(p) }
            .clickable { onClick() }
            .padding(horizontal = 9.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(15.dp), tint = tint ?: if (selected) theme.accent else theme.textSecondary)
        Spacer(Modifier.width(8.dp))
        Text(label, fontSize = 12.sp, color = theme.text, maxLines = 1)
    }
}

@Composable
private fun SplitterHandle(vertical: Boolean, modifier: Modifier) {
    val theme = LocalLauncherTheme.current
    Box(modifier.background(theme.divider.copy(alpha = 0.6f)), contentAlignment = Alignment.Center) {
        Box(
            Modifier.clip(RoundedCornerShape(2.dp)).background(theme.textSecondary.copy(alpha = 0.5f))
                .then(if (vertical) Modifier.size(32.dp, 3.dp) else Modifier.size(3.dp, 32.dp)),
        )
    }
}

// ————————————————————————— Pane —————————————————————————

private data class Listing(val dir: String, val files: List<File>?)

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PaneView(
    windowId: String,
    side: String,
    pane: PaneState,
    focused: Boolean,
    home: File,
    ops: PaneOps,
    modifier: Modifier,
    onFocus: () -> Unit,
) {
    val theme = LocalLauncherTheme.current
    val context = LocalContext.current
    val showHidden = Settings.showHidden
    val dir = pane.currentDir
    val tick = FsEvents.tick

    // Directory listing, read off the main thread (null = unreadable)
    val listing by produceState(Listing("", emptyList()), dir, pane.refreshTick, tick, showHidden) {
        value = withContext(Dispatchers.IO) {
            Listing(
                dir.absolutePath,
                when {
                    Trash.isTrash(dir) -> emptyList()
                    dir.absolutePath == "/storage" -> storageVolumeDirs(context)
                    else -> dir.listFiles()?.filter { showHidden || !it.name.startsWith(".") }
                },
            )
        }
    }
    val binEntries = remember(dir, pane.refreshTick, tick) { if (pane.inTrash) Trash.listEntries() else emptyList() }
    val files = listing.files?.let { sortFiles(it, pane.sortKey, pane.sortAsc) }
    val loading = listing.dir != dir.absolutePath

    // Search: name search below this folder, or tag/SKU search
    var results by remember { mutableStateOf<List<File>?>(null) }
    LaunchedEffect(pane.searching, pane.query, dir) {
        if (!pane.searching || pane.query.trim().length < 2) { results = null; return@LaunchedEffect }
        delay(300)
        val q = pane.query.trim()
        val tagQuery = Regex("^(who|what|when|where)\\s*[:=]", RegexOption.IGNORE_CASE).containsMatchIn(q) || q.startsWith("GK-", true)
        results = withContext(Dispatchers.IO) {
            val byTag = FileIndex.search(q).map { File(it.path) }.filter { it.exists() }
            if (tagQuery) byTag else (byTag + FileOps.search(dir, q, showHidden = showHidden)).distinctBy { it.absolutePath }
        }
        Timeline.record("search_performed", "Searched \"$q\" in ${dir.name.ifEmpty { "storage" }} (${results?.size ?: 0} results)")
    }

    var bgMenuAt by remember { mutableStateOf<Offset?>(null) }
    val paneTarget = "pane-$windowId-$side"
    val paneHover = isDropHover(paneTarget, 1)

    Column(
        modifier
            .pointerInput(Unit) { detectTapGestures(onPress = { onFocus() }) }
            .background(if (paneHover) theme.accent.copy(alpha = 0.08f) else Color.Transparent),
    ) {
        if (focused) Box(Modifier.fillMaxWidth().height(2.dp).background(theme.accent.copy(alpha = 0.7f)))
        AddressBar(windowId, side, pane, home, ops)
        Box(Modifier.fillMaxWidth().height(1.dp).background(theme.divider))

        if (pane.view == ViewMode.LIST || pane.inTrash) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                HeaderCell("Name", pane, SortKey.NAME, Modifier.weight(1f))
                HeaderCell(if (pane.inTrash) "Deleted" else "Modified", pane, SortKey.MODIFIED, Modifier.width(70.dp))
                HeaderCell("Size", pane, SortKey.SIZE, Modifier.width(58.dp))
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(theme.divider))
        }

        Box(
            Modifier
                .fillMaxWidth()
                .weight(1f)
                .dropTarget(paneTarget, 1, accepts = acceptsInto(dir), verb = verbFor(dir, dir.name.ifEmpty { "storage" })) { p, _ ->
                    ops.onDrop(pane, dir, p)
                }
                .pointerInput(dir) {
                    detectTapGestures(
                        onTap = { onFocus(); pane.selection = emptySet() },
                        onLongPress = { pos -> onFocus(); bgMenuAt = pos },
                    )
                },
        ) {
            val shown = results
            when {
                pane.inTrash -> if (binEntries.isEmpty()) {
                    EmptyText("Recycle Bin is empty")
                } else {
                    LazyColumn(Modifier.fillMaxSize()) {
                        items(binEntries, key = { it.file.absolutePath }) { entry ->
                            val sel = entry.file.absolutePath in pane.selection
                            FileRow(
                                icon = if (entry.file.isDirectory) Icons.Filled.Folder else fileIcon(entry.displayName),
                                iconTint = if (entry.file.isDirectory) Color(0xFFFFCA28) else theme.textSecondary,
                                name = entry.displayName,
                                subtitle = entry.originalPath?.let { File(it).parent?.removePrefix(home.absolutePath)?.trim('/')?.ifEmpty { "Home" } },
                                date = entry.file.lastModified(),
                                sizeText = if (entry.file.isDirectory) "" else formatSize(entry.file.length()),
                                selected = sel,
                                modifier = Modifier.dragSource(
                                    entry.file.absolutePath, payload = { null },
                                    onTap = { onFocus(); pane.toggle(entry.file.absolutePath) },
                                    onLongPress = { onFocus(); pane.toggle(entry.file.absolutePath) },
                                ),
                            )
                        }
                    }
                }
                pane.searching && shown != null -> if (shown.isEmpty()) EmptyText("No results") else {
                    FileCollection(windowId, side, pane, shown, home, ops, showLocation = true, onFocus = onFocus)
                }
                files == null && !loading -> PermissionEmptyState()
                files.isNullOrEmpty() -> if (!loading) EmptyText("This folder is empty") else Unit
                else -> FileCollection(windowId, side, pane, files, home, ops, showLocation = false, onFocus = onFocus)
            }

            bgMenuAt?.let { at ->
                Box(Modifier.offset { IntOffset(at.x.roundToInt(), at.y.roundToInt()) }) {
                    Win11Menu(true, { bgMenuAt = null }) {
                        BackgroundMenu(pane, ops) { bgMenuAt = null }
                    }
                }
            }
        }
    }
}

@Composable
private fun BackgroundMenu(pane: PaneState, ops: PaneOps, close: () -> Unit) {
    var page by remember { mutableIntStateOf(0) }
    if (page == 1) {
        MenuRow(Icons.AutoMirrored.Outlined.ArrowBack, "Back") { page = 0 }
        MenuDivider()
        SortKey.entries.forEach { k -> MenuRow(null, k.label, checked = pane.sortKey == k) { pane.sortKey = k; close() } }
        return
    }
    if (pane.inTrash) {
        MenuRow(Icons.Outlined.DeleteForever, "Empty Recycle Bin") { ops.onEmptyBin(); close() }
        return
    }
    MenuRow(Icons.Outlined.CreateNewFolder, "New folder") { ops.onNewFolder(pane.currentDir); close() }
    MenuRow(Icons.Outlined.Description, "New text document") { ops.onNewText(pane.currentDir); close() }
    MenuRow(Icons.Outlined.ContentPaste, "Paste", enabled = ExplorerClipboard.files.isNotEmpty()) { ops.onPaste(pane.currentDir); close() }
    MenuDivider()
    MenuRow(if (pane.view == ViewMode.LIST) Icons.Outlined.GridView else Icons.Outlined.ViewList, if (pane.view == ViewMode.LIST) "Large icons" else "Details") {
        pane.view = if (pane.view == ViewMode.LIST) ViewMode.GRID else ViewMode.LIST; close()
    }
    MenuRow(Icons.AutoMirrored.Outlined.Sort, "Sort by", submenu = true) { page = 1 }
    MenuRow(Icons.Outlined.Refresh, "Refresh") { pane.refresh(); close() }
    if (Limbo.workspace != null) {
        MenuDivider()
        MenuRow(Icons.Outlined.Inventory2, "Repackage & place here") { ops.onRepackage(pane.currentDir); close() }
    }
}

@Composable
private fun HeaderCell(label: String, pane: PaneState, key: SortKey, modifier: Modifier) {
    val theme = LocalLauncherTheme.current
    Row(modifier.clickable { pane.setSort(key) }, verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = theme.textSecondary, fontSize = 11.sp, maxLines = 1)
        if (pane.sortKey == key) {
            Icon(
                if (pane.sortAsc) Icons.Outlined.KeyboardArrowUp else Icons.Outlined.KeyboardArrowDown, null,
                Modifier.size(12.dp), tint = theme.textSecondary,
            )
        }
    }
}

@Composable
private fun EmptyText(text: String) {
    val theme = LocalLauncherTheme.current
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text, color = theme.textSecondary, fontSize = 12.sp)
    }
}

// ————————————————————————— Address bar —————————————————————————

@Composable
private fun AddressBar(windowId: String, side: String, pane: PaneState, home: File, ops: PaneOps) {
    val theme = LocalLauncherTheme.current
    Row(
        Modifier.fillMaxWidth().height(40.dp).padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CommandIcon(Icons.AutoMirrored.Outlined.ArrowBack, "Back", enabled = pane.canGoBack) { pane.goBack() }
        if (pane.canGoForward) CommandIcon(Icons.AutoMirrored.Outlined.ArrowForward, "Forward", enabled = true) { pane.goForward() }
        CommandIcon(
            Icons.Outlined.ArrowUpward, "Up",
            enabled = !pane.inTrash && pane.currentDir.parentFile != null && pane.currentDir.absolutePath != "/" && pane.currentDir.absolutePath != "/storage",
        ) {
            val parent = pane.currentDir.parentFile
            if (parent != null) pane.navigate(if (parent.absolutePath == "/storage/emulated") File("/storage") else parent)
        }
        Spacer(Modifier.width(4.dp))
        Row(
            Modifier
                .weight(1f)
                .height(30.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(theme.inputField)
                .border(1.dp, if (pane.searching) theme.accent else theme.stroke, RoundedCornerShape(4.dp))
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (pane.searching) {
                Icon(Icons.Outlined.Search, null, Modifier.size(14.dp), tint = theme.textSecondary)
                Spacer(Modifier.width(6.dp))
                Box(Modifier.weight(1f)) {
                    if (pane.query.isEmpty()) Text("Search ${pane.currentDir.name.ifEmpty { "storage" }} or who:name", color = theme.textDisabled, fontSize = 12.sp, maxLines = 1)
                    val focus = remember { androidx.compose.ui.focus.FocusRequester() }
                    BasicTextField(
                        value = pane.query, onValueChange = { pane.query = it }, singleLine = true,
                        textStyle = TextStyle(color = theme.text, fontSize = 12.sp), cursorBrush = SolidColor(theme.accent),
                        modifier = Modifier.fillMaxWidth().focusRequester(focus),
                    )
                    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
                }
            } else {
                Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically) {
                    breadcrumbsFor(pane.currentDir, home, Limbo.workspace?.dir).forEachIndexed { index, (label, dir) ->
                        if (index > 0) Icon(Icons.Outlined.ChevronRight, null, Modifier.size(14.dp), tint = theme.textSecondary)
                        Crumb(windowId, side, label, dir, pane, ops)
                    }
                }
            }
        }
        Spacer(Modifier.width(2.dp))
        if (pane.searching) {
            CommandIcon(Icons.Outlined.Close, "Close search", enabled = true) { pane.searching = false; pane.query = "" }
        } else {
            CommandIcon(Icons.Outlined.Search, "Search", enabled = !pane.inTrash) { pane.searching = true }
            CommandIcon(Icons.Outlined.Refresh, "Refresh", enabled = true) { pane.refresh() }
        }
    }
}

@Composable
private fun Crumb(windowId: String, side: String, label: String, dir: File?, pane: PaneState, ops: PaneOps) {
    val theme = LocalLauncherTheme.current
    val id = "crumb-$windowId-$side-${dir?.absolutePath}"
    val hover = dir != null && isDropHover(id, 4)
    Text(
        label,
        color = theme.text, fontSize = 12.sp, maxLines = 1,
        modifier = Modifier
            .clip(RoundedCornerShape(3.dp))
            .background(if (hover) theme.accent.copy(alpha = 0.3f) else Color.Transparent)
            .then(
                if (dir != null && dir.absolutePath != "/storage") {
                    Modifier.dropTarget(id, 4, accepts = acceptsInto(dir), verb = verbFor(dir, label)) { p, _ -> ops.onDrop(pane, dir, p) }
                } else Modifier,
            )
            .clickable(enabled = dir != null) { dir?.let { pane.navigate(it) } }
            .padding(horizontal = 5.dp, vertical = 3.dp),
    )
}

// ————————————————————————— Items —————————————————————————

@Composable
private fun FileCollection(
    windowId: String,
    side: String,
    pane: PaneState,
    files: List<File>,
    home: File,
    ops: PaneOps,
    showLocation: Boolean,
    onFocus: () -> Unit,
) {
    if (pane.view == ViewMode.GRID) {
        LazyVerticalGrid(GridCells.Adaptive(86.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(6.dp)) {
            items(files, key = { it.absolutePath }) { f ->
                FileItem(windowId, side, pane, f, home, ops, showLocation, grid = true, onFocus = onFocus)
            }
        }
    } else {
        LazyColumn(Modifier.fillMaxSize()) {
            items(files, key = { it.absolutePath }) { f ->
                FileItem(windowId, side, pane, f, home, ops, showLocation, grid = false, onFocus = onFocus)
            }
        }
    }
}

@Composable
private fun FileItem(
    windowId: String,
    side: String,
    pane: PaneState,
    f: File,
    home: File,
    ops: PaneOps,
    showLocation: Boolean,
    grid: Boolean,
    onFocus: () -> Unit,
) {
    val theme = LocalLauncherTheme.current
    val path = f.absolutePath
    val selected = path in pane.selection
    var menuOpen by remember { mutableStateOf(false) }
    val isDir = f.isDirectory
    val pref = if (isDir) FolderPrefs.prefs[path] else null
    val indexed = FileIndex.records[path]
    val targetId = "row-$windowId-$side-$path"
    val hover = isDir && isDropHover(targetId, 3)
    val beingCut = ExplorerClipboard.isCut && ExplorerClipboard.files.any { it.absolutePath == path }

    val icon = if (isDir) folderIcon(pref?.icon) else fileIcon(f.name)
    val tint = if (isDir) pref?.color?.let { Color(it) } ?: Color(0xFFFFCA28) else theme.textSecondary
    val name = volumeDisplayName(f) ?: f.name
    val subtitle = if (showLocation) f.parent?.removePrefix(home.absolutePath)?.trim('/')?.ifEmpty { "Home" } else indexed?.sku

    val gestures = Modifier
        .then(if (isDir) Modifier.dropTarget(targetId, 3, accepts = acceptsInto(f), verb = verbFor(f, f.name)) { p, _ -> ops.onDrop(pane, f, p) } else Modifier)
        .dragSource(
            key = path,
            payload = {
                val list = if (selected) pane.selection.map { File(it) }.filter { it.exists() } else listOf(f)
                FilesPayload(list, fromDir = pane.currentDir)
            },
            onTap = {
                onFocus()
                if (pane.selection.isNotEmpty()) pane.toggle(path) else ops.onOpen(pane, f)
            },
            onLongPress = {
                onFocus()
                if (!selected) pane.selection = pane.selection + path
                menuOpen = true
            },
        )

    Box(Modifier.alpha(if (beingCut) 0.5f else 1f)) {
        if (grid) {
            Column(
                Modifier
                    .padding(3.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(
                        when {
                            hover -> theme.accent.copy(alpha = 0.32f)
                            selected -> theme.accent.copy(alpha = 0.18f)
                            else -> Color.Transparent
                        },
                    )
                    .then(gestures)
                    .padding(vertical = 8.dp, horizontal = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.size(52.dp), contentAlignment = Alignment.Center) {
                    if (!isDir && isImage(f)) {
                        Thumbnail(f, Modifier.size(52.dp).clip(RoundedCornerShape(4.dp))) {
                            Icon(icon, null, Modifier.size(40.dp), tint = tint)
                        }
                    } else {
                        Icon(icon, null, Modifier.size(if (isDir) 48.dp else 40.dp), tint = tint)
                    }
                    if (indexed != null) TagDot(Modifier.align(Alignment.BottomEnd), indexed.flagged)
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    name, fontSize = 11.sp, color = theme.text, maxLines = 2, overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center, lineHeight = 13.sp,
                )
            }
        } else {
            FileRow(
                icon = icon, iconTint = tint, name = name, subtitle = subtitle,
                date = f.lastModified(), sizeText = if (isDir) "" else formatSize(f.length()),
                selected = selected, hover = hover, tagged = indexed != null, flagged = indexed?.flagged == true,
                modifier = gestures,
            )
        }

        Win11Menu(menuOpen, { menuOpen = false }) {
            ItemMenu(pane, f, ops) { menuOpen = false }
        }
    }
}

@Composable
private fun TagDot(modifier: Modifier, flagged: Boolean) {
    Box(
        modifier.size(9.dp).clip(CircleShape)
            .background(if (flagged) Color(0xFFFF3355) else Color(0xFF00C853))
            .border(1.dp, Color(0x99000000), CircleShape),
    )
}

@Composable
private fun ItemMenu(pane: PaneState, f: File, ops: PaneOps, close: () -> Unit) {
    var page by remember { mutableIntStateOf(0) }
    val selected = pane.selection.map { File(it) }.filter { it.exists() }.ifEmpty { listOf(f) }
    val multi = selected.size > 1
    if (page == 1) {
        AddToFolderMenu(selected, ops, back = { page = 0 }, close = close)
        return
    }
    if (multi) MenuHeader("${selected.size} items selected")
    if (!multi) {
        MenuRow(Icons.Outlined.OpenInNew, "Open") { ops.onOpen(pane, f); close() }
        if (f.isDirectory) {
            MenuRow(Icons.Outlined.Tab, "Open in new window") { ops.onOpenNewWindow(f); close() }
            MenuRow(Icons.Outlined.ViewColumn, "Open in other pane") { ops.onOpenOtherPane(pane, f); close() }
        }
    }
    MenuRow(Icons.Outlined.CheckBox, if (f.absolutePath in pane.selection) "Deselect" else "Select") { pane.toggle(f.absolutePath); close() }
    MenuDivider()
    MenuRow(Icons.Outlined.ContentCut, "Cut") { ExplorerClipboard.set(selected, true); pane.selection = emptySet(); close() }
    MenuRow(Icons.Outlined.ContentCopy, "Copy") { ExplorerClipboard.set(selected, false); pane.selection = emptySet(); close() }
    if (f.isDirectory && ExplorerClipboard.files.isNotEmpty() && !multi) {
        MenuRow(Icons.Outlined.ContentPaste, "Paste into folder") { ops.onPaste(f); close() }
    }
    if (!multi) MenuRow(Icons.Outlined.DriveFileRenameOutline, "Rename") { ops.onRename(f); close() }
    if (selected.any { it.isFile }) MenuRow(Icons.Outlined.Share, "Share") { ops.onShare(selected); close() }
    MenuRow(Icons.Outlined.Delete, "Delete", danger = true) { ops.onDelete(pane, selected); close() }
    MenuDivider()
    MenuRow(Icons.Outlined.Apps, "Add to app folder", submenu = true) { page = 1 }
    if (!multi) {
        MenuRow(Icons.Outlined.Sell, "Properties & tags") { ops.onInspect(f); close() }
        if (f.isFile) MenuRow(Icons.Outlined.Lock, "Add to vault") { ops.onVault(f); close() }
        if (f.extension.equals("zip", true)) MenuRow(Icons.Outlined.Science, "Open in Limbo") { ops.onLimbo(f); close() }
        if (f.isDirectory) MenuRow(Icons.Outlined.Palette, "Customize folder") { ops.onCustomize(f); close() }
    }
}

@Composable
private fun FileRow(
    icon: ImageVector,
    iconTint: Color,
    name: String,
    subtitle: String?,
    date: Long,
    sizeText: String,
    selected: Boolean,
    modifier: Modifier,
    hover: Boolean = false,
    tagged: Boolean = false,
    flagged: Boolean = false,
) {
    val theme = LocalLauncherTheme.current
    Row(
        Modifier
            .fillMaxWidth()
            .background(
                when {
                    hover -> theme.accent.copy(alpha = 0.32f)
                    selected -> theme.accent.copy(alpha = 0.18f)
                    else -> Color.Transparent
                },
            )
            .then(modifier)
            .padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            Icon(icon, null, Modifier.size(18.dp), tint = iconTint)
            if (tagged) TagDot(Modifier.align(Alignment.BottomEnd).offset(x = 3.dp, y = 3.dp).size(7.dp), flagged)
        }
        Spacer(Modifier.width(9.dp))
        Column(Modifier.weight(1f)) {
            Text(name, fontSize = 12.sp, color = theme.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (subtitle != null) {
                Text(subtitle, fontSize = 10.sp, color = theme.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Text(
            SimpleDateFormat("M/d/yy", Locale.getDefault()).format(Date(date)),
            fontSize = 10.sp, color = theme.textSecondary, modifier = Modifier.width(70.dp),
        )
        Text(sizeText, fontSize = 10.sp, color = theme.textSecondary, modifier = Modifier.width(58.dp))
    }
}

// ————————————————————————— Status bar —————————————————————————

@Composable
private fun StatusBar(pane: PaneState, clipCount: Int, cut: Boolean) {
    val theme = LocalLauncherTheme.current
    val tick = FsEvents.tick
    val count = remember(pane.currentDir, pane.refreshTick, tick, Settings.showHidden) {
        if (pane.inTrash) Trash.listEntries().size
        else pane.currentDir.listFiles()?.count { Settings.showHidden || !it.name.startsWith(".") } ?: 0
    }
    val free = remember(pane.currentDir) { freeSpaceText(pane.currentDir) }
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            "$count items" +
                (if (pane.selection.isNotEmpty()) "   |   ${pane.selection.size} selected" else "") +
                (if (clipCount > 0) "   |   $clipCount ${if (cut) "cut" else "copied"}" else ""),
            color = theme.textSecondary, fontSize = 11.sp, modifier = Modifier.weight(1f), maxLines = 1,
        )
        if (free != null && !pane.inTrash) Text(free, color = theme.textSecondary, fontSize = 10.sp, maxLines = 1)
    }
}

// ————————————————————————— Permission + customize —————————————————————————

@Composable
private fun PermissionEmptyState() {
    val theme = LocalLauncherTheme.current
    val context = LocalContext.current
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Icon(Icons.Outlined.Lock, null, Modifier.size(30.dp), tint = theme.textDisabled)
        Spacer(Modifier.height(8.dp))
        Text("Can't read this folder", color = theme.text, fontSize = 13.sp)
        Text("Storage access may be required", color = theme.textSecondary, fontSize = 11.sp)
        Spacer(Modifier.height(12.dp))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
            AccentButton("Grant all-files access", onClick = {
                runCatching {
                    context.startActivity(
                        Intent(AndroidSettings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${context.packageName}"))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    )
                }
            })
        }
    }
}

private val SWATCHES = listOf(0xFFFFCA28, 0xFF6C63FF, 0xFF00D4FF, 0xFF00C853, 0xFFFFD700, 0xFFFF6B35, 0xFFFF3355, 0xFFE2E8F0, 0xFF64748B)

@Composable
private fun CustomizeFolderDialog(dir: File, onDismiss: () -> Unit) {
    val theme = LocalLauncherTheme.current
    val current = FolderPrefs.prefs[dir.absolutePath] ?: FolderPref()
    var color by remember { mutableStateOf(current.color) }
    var icon by remember { mutableStateOf(current.icon) }
    Win11Dialog(
        title = "Customize \"${dir.name}\"",
        onDismiss = onDismiss,
        primary = "Save",
        onPrimary = { FolderPrefs.set(dir.absolutePath, FolderPref(color, icon)); onDismiss() },
    ) {
        Text("Color", color = theme.textSecondary, fontSize = 12.sp)
        Spacer(Modifier.height(6.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            SWATCHES.forEach { c ->
                Box(
                    Modifier.size(26.dp).clip(CircleShape).background(Color(c))
                        .border(2.dp, if (color == c) theme.text else Color.Transparent, CircleShape)
                        .clickable { color = c },
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Text("Icon", color = theme.textSecondary, fontSize = 12.sp)
        Spacer(Modifier.height(6.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            FolderPrefs.ICONS.forEach { name ->
                Box(
                    Modifier.size(34.dp).clip(RoundedCornerShape(6.dp))
                        .background(if ((icon ?: "folder") == name) theme.accent.copy(alpha = 0.25f) else theme.card)
                        .clickable { icon = if (name == "folder") null else name },
                    contentAlignment = Alignment.Center,
                ) { Icon(folderIcon(name), null, Modifier.size(18.dp), tint = color?.let { Color(it) } ?: Color(0xFFFFCA28)) }
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(
            "Reset to default", color = theme.accent, fontSize = 12.sp,
            modifier = Modifier.clip(RoundedCornerShape(4.dp)).clickable { color = null; icon = null }.padding(4.dp),
        )
    }
}
