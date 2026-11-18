package com.ghostkey.explorer.desktop

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.automirrored.outlined.InsertDriveFile
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ghostkey.explorer.apps.InstalledAppsRepository
import com.ghostkey.explorer.data.AppFolder
import com.ghostkey.explorer.data.AppFolders
import com.ghostkey.explorer.data.DesktopLayout
import com.ghostkey.explorer.data.FolderItem
import com.ghostkey.explorer.drag.DeskIconPayload
import com.ghostkey.explorer.drag.DragPayload
import com.ghostkey.explorer.drag.FilesPayload
import com.ghostkey.explorer.drag.FolderItemPayload
import com.ghostkey.explorer.drag.LocalDragController
import com.ghostkey.explorer.drag.dragSource
import com.ghostkey.explorer.drag.dropTarget
import com.ghostkey.explorer.drag.isDropHover
import com.ghostkey.explorer.explorer.ExplorerClipboard
import com.ghostkey.explorer.explorer.FsEvents
import com.ghostkey.explorer.explorer.fileIcon
import com.ghostkey.explorer.files.FileOpener
import com.ghostkey.explorer.files.FileOps
import com.ghostkey.explorer.files.Trash
import com.ghostkey.explorer.shell.LocalShellActions
import com.ghostkey.explorer.theme.LocalLauncherTheme
import com.ghostkey.explorer.ui.ConfirmDialog
import com.ghostkey.explorer.ui.MenuDivider
import com.ghostkey.explorer.ui.MenuRow
import com.ghostkey.explorer.ui.PromptDialog
import com.ghostkey.explorer.ui.Toasts
import com.ghostkey.explorer.ui.Win11Menu
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.math.abs
import kotlin.math.roundToInt

// A desktop icon. Keys: "builtin:<id>", "folder:<appFolderId>", "path:<file>".
private data class DeskIcon(
    val key: String,
    val label: String,
    val kind: Kind,
    val folder: AppFolder? = null,
    val file: File? = null,
) {
    enum class Kind { BUILTIN, APP_FOLDER, PATH }
}

private val BUILTINS = listOf(
    "builtin:files" to "File Explorer",
    "builtin:thispc" to "This PC",
    "builtin:bin" to "Recycle Bin",
    "builtin:vaults" to "Vaults",
    "builtin:timeline" to "Timeline",
)

private sealed interface DeskPrompt {
    data object NewAppFolder : DeskPrompt
    data object NewFolder : DeskPrompt
    data class RenameFolder(val folder: AppFolder) : DeskPrompt
    data class RenameFile(val file: File) : DeskPrompt
    data class DeleteFolder(val folder: AppFolder) : DeskPrompt
}

// The Ghost Key home board (NeverSoft 11's desktop): grid-snapped icons for
// your app folders (the same folders the home-screen widgets show), the real
// storage "Desktop" folder, and shell built-ins. Long-press = menu,
// long-press + drag = move it, onto a folder, or into an explorer window.
@Composable
fun Desktop(modifier: Modifier = Modifier) {
    val theme = LocalLauncherTheme.current
    val context = LocalContext.current
    val actions = LocalShellActions.current
    val drag = LocalDragController.current
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()

    val desktopDir = remember { FileOps.desktopDir() }
    val tick = FsEvents.tick
    var desktopFiles by remember { mutableStateOf(emptyList<File>()) }
    LaunchedEffect(tick) {
        desktopFiles = withContext(Dispatchers.IO) {
            desktopDir.listFiles()?.filter { !it.name.startsWith(".") }?.sortedBy { it.name.lowercase() } ?: emptyList()
        }
    }
    val icons: List<DeskIcon> = BUILTINS.map { (k, l) -> DeskIcon(k, l, DeskIcon.Kind.BUILTIN) } +
        AppFolders.folders.map { DeskIcon("folder:${it.id}", it.name, DeskIcon.Kind.APP_FOLDER, folder = it) } +
        desktopFiles.map { DeskIcon("path:${it.absolutePath}", it.name, DeskIcon.Kind.PATH, file = it) }

    var bgMenuAt by remember { mutableStateOf<Offset?>(null) }
    var prompt by remember { mutableStateOf<DeskPrompt?>(null) }
    var rootOrigin by remember { mutableStateOf(Offset.Zero) }

    BoxWithConstraints(
        modifier
            .onGloballyPositioned { rootOrigin = it.positionInRoot() }
            .pointerInput(Unit) {
                detectTapGestures(onLongPress = { bgMenuAt = it }, onTap = { bgMenuAt = null })
            },
    ) {
        val cellPx = with(density) { 92.dp.toPx() }
        val marginPx = with(density) { 12.dp.toPx() }
        val widthPx = with(density) { maxWidth.toPx() }
        val heightPx = with(density) { maxHeight.toPx() }
        val rows = ((heightPx - marginPx) / cellPx).toInt().coerceAtLeast(1)
        val cols = ((widthPx - marginPx) / cellPx).toInt().coerceAtLeast(1)

        fun snap(p: Offset): Offset {
            val c = ((p.x - marginPx) / cellPx).roundToInt().coerceIn(0, cols - 1)
            val r = ((p.y - marginPx) / cellPx).roundToInt().coerceIn(0, rows - 1)
            return Offset(marginPx + c * cellPx, marginPx + r * cellPx)
        }

        fun occupied(p: Offset, except: String?): Boolean = DesktopLayout.positions.any { (k, v) ->
            k != except && icons.any { it.key == k } && abs(v.x - p.x) < cellPx * 0.5f && abs(v.y - p.y) < cellPx * 0.5f
        }

        // First grid cell not used by any icon, filling columns top-to-bottom
        // then moving right, like Windows auto-arrange.
        fun firstFreeCell(taken: List<Offset>): Offset {
            for (col in 0 until 60) for (row in 0 until rows) {
                val p = Offset(marginPx + col * cellPx, marginPx + row * cellPx)
                if (taken.none { abs(it.x - p.x) < cellPx * 0.5f && abs(it.y - p.y) < cellPx * 0.5f }) return p
            }
            return Offset(marginPx, marginPx)
        }

        // Place new icons and self-heal any that are off-screen or stacked.
        LaunchedEffect(icons.map { it.key }, rows, cols) {
            val taken = mutableListOf<Offset>()
            var changed = false
            icons.forEach { icon ->
                val known = DesktopLayout.positions[icon.key]
                val bad = known == null || known.x < 0 || known.y < 0 ||
                    known.x > widthPx - cellPx * 0.6f || known.y > heightPx - cellPx * 0.4f ||
                    taken.any { abs(it.x - known.x) < cellPx * 0.5f && abs(it.y - known.y) < cellPx * 0.5f }
                val pos = if (bad) firstFreeCell(taken).also { changed = true } else known!!
                taken += pos
                if (known != pos) DesktopLayout.set(icon.key, pos)
            }
            if (changed) DesktopLayout.save()
        }

        /** Drop on empty desktop: move an icon there, or bring files onto the desktop. */
        fun dropOnDesktop(p: DragPayload, at: Offset) {
            val local = at - rootOrigin - drag.grabOffset + Offset(cellPx * 0.3f, cellPx * 0.2f)
            val cell = snap(local)
            val key = when (p) {
                is DeskIconPayload -> p.deskKey
                is FilesPayload -> p.deskKey
                else -> null
            }
            if (key != null) {
                if (!occupied(cell, key)) { DesktopLayout.set(key, cell); DesktopLayout.save() }
                return
            }
            if (p is FilesPayload) {
                if (p.files.size == 1) DesktopLayout.set("path:${File(desktopDir, p.files.first().name).absolutePath}", cell)
                scope.launch {
                    val r = withContext(Dispatchers.IO) { FileOps.transfer(p.files, desktopDir, copy = com.ghostkey.explorer.data.Settings.dragCopies) }
                    FsEvents.changed()
                    if (r.failed > 0) Toasts.error(r.message) else Toasts.success("Moved ${r.done} item(s) to the desktop")
                }
            }
        }

        // Empty desktop is itself a drop target (lowest layer)
        Box(
            Modifier.fillMaxSize().dropTarget(
                "desktop-bg", 1,
                accepts = { p ->
                    when (p) {
                        is DeskIconPayload -> true
                        is FilesPayload -> p.deskKey != null || p.files.any { it.parentFile?.absolutePath != desktopDir.absolutePath }
                        else -> false
                    }
                },
                verb = { p -> if (p is FilesPayload && p.deskKey == null) "Move to Desktop" else "Move here" },
            ) { p, at -> dropOnDesktop(p, at) },
        )

        icons.forEach { icon ->
            val pos = DesktopLayout.positions[icon.key]
            if (pos != null) key(icon.key) {
                val dragging = drag.payload.let {
                    (it is DeskIconPayload && it.deskKey == icon.key) || (it is FilesPayload && it.deskKey == icon.key)
                }
                DesktopIconView(
                    icon = icon,
                    modifier = Modifier.offset { IntOffset(pos.x.roundToInt(), pos.y.roundToInt()) }.alpha(if (dragging) 0.35f else 1f),
                    onOpen = {
                        when (icon.kind) {
                            DeskIcon.Kind.BUILTIN -> when (icon.key) {
                                "builtin:files" -> actions.openExplorer(null, newWindow = false)
                                "builtin:thispc" -> actions.openExplorer("/storage")
                                "builtin:bin" -> actions.openExplorer(Trash.dir().absolutePath)
                                "builtin:vaults" -> actions.openVaults()
                                "builtin:timeline" -> actions.openTimeline()
                            }
                            DeskIcon.Kind.APP_FOLDER -> actions.openAppFolder(icon.folder!!.id)
                            DeskIcon.Kind.PATH -> icon.file!!.let {
                                if (it.isDirectory) actions.openExplorer(it.absolutePath) else FileOpener.open(context, it)
                            }
                        }
                    },
                    onPrompt = { prompt = it },
                    onDropped = { p ->
                        // Something was dropped onto this icon
                        when {
                            icon.key == "builtin:bin" && p is FilesPayload -> scope.launch {
                                val r = withContext(Dispatchers.IO) { FileOps.delete(p.files) }
                                FsEvents.changed()
                                if (r.failed > 0) Toasts.error(r.message) else Toasts.success("Moved ${r.done} item(s) to the Recycle Bin")
                            }
                            icon.key == "builtin:bin" && p is FolderItemPayload -> {
                                AppFolders.removeItem(p.folderId, p.item)
                                Toasts.show("Removed \"${p.item.label}\" from the folder")
                            }
                            icon.kind == DeskIcon.Kind.APP_FOLDER && p is FolderItemPayload -> {
                                val f = icon.folder!!
                                if (p.folderId.isEmpty()) AppFolders.addItems(f.id, listOf(p.item)) else AppFolders.moveItem(p.folderId, f.id, p.item)
                                Toasts.success("\"${p.item.label}\" → ${f.name}")
                            }
                            icon.kind == DeskIcon.Kind.APP_FOLDER && p is FilesPayload -> {
                                val f = icon.folder!!
                                AppFolders.addItems(f.id, p.files.map { FolderItem("file", it.absolutePath, it.name) })
                                Toasts.success("Added ${p.files.size} shortcut(s) to ${f.name}")
                            }
                            icon.kind == DeskIcon.Kind.PATH && p is FilesPayload -> scope.launch {
                                val dest = icon.file!!
                                val copy = com.ghostkey.explorer.data.Settings.dragCopies
                                val r = withContext(Dispatchers.IO) { FileOps.transfer(p.files, dest, copy) }
                                FsEvents.changed()
                                if (r.failed > 0) Toasts.error(r.message) else Toasts.success("${if (copy) "Copied" else "Moved"} ${r.done} item(s) to ${dest.name}")
                            }
                        }
                    },
                )
            }
        }

        bgMenuAt?.let { at ->
            Box(Modifier.offset { IntOffset(at.x.roundToInt(), at.y.roundToInt()) }) {
                Win11Menu(true, { bgMenuAt = null }) {
                    MenuRow(Icons.Outlined.Apps, "New app folder") { bgMenuAt = null; prompt = DeskPrompt.NewAppFolder }
                    MenuRow(Icons.Outlined.CreateNewFolder, "New folder") { bgMenuAt = null; prompt = DeskPrompt.NewFolder }
                    MenuRow(Icons.Outlined.ContentPaste, "Paste", enabled = ExplorerClipboard.files.isNotEmpty()) {
                        bgMenuAt = null
                        val files = ExplorerClipboard.files
                        val cut = ExplorerClipboard.isCut
                        scope.launch {
                            val r = withContext(Dispatchers.IO) { FileOps.transfer(files, desktopDir, copy = !cut) }
                            if (cut && r.failed == 0) ExplorerClipboard.clear()
                            FsEvents.changed()
                            if (r.failed > 0) Toasts.error(r.message)
                        }
                    }
                    MenuRow(Icons.Outlined.Refresh, "Refresh") { bgMenuAt = null; FsEvents.changed() }
                    MenuDivider()
                    MenuRow(Icons.Outlined.FolderOpen, "Open Desktop folder") { bgMenuAt = null; actions.openExplorer(desktopDir.absolutePath) }
                    MenuRow(Icons.Outlined.Palette, "Personalize") { bgMenuAt = null; actions.openSettings() }
                }
            }
        }
    }

    when (val p = prompt) {
        DeskPrompt.NewAppFolder -> PromptDialog(
            title = "New app folder", initial = "New folder", confirm = "Create",
            message = "Put apps and file shortcuts in it, then place it on your home screen as a widget.",
            onConfirm = { name -> actions.openAppFolder(AppFolders.create(name).id) },
            onDismiss = { prompt = null },
        )
        DeskPrompt.NewFolder -> PromptDialog(
            title = "New folder", initial = "New folder", confirm = "Create",
            onConfirm = { name -> FileOps.newFolder(desktopDir, name).onSuccess { FsEvents.changed() }.onFailure { Toasts.error(it.message ?: "Failed") } },
            onDismiss = { prompt = null },
        )
        is DeskPrompt.RenameFolder -> PromptDialog(
            title = "Rename folder", initial = p.folder.name,
            onConfirm = { AppFolders.rename(p.folder.id, it) },
            onDismiss = { prompt = null },
        )
        is DeskPrompt.RenameFile -> PromptDialog(
            title = "Rename", initial = p.file.name,
            onConfirm = { name -> FileOps.rename(p.file, name).onSuccess { FsEvents.changed() }.onFailure { Toasts.error(it.message ?: "Rename failed") } },
            onDismiss = { prompt = null },
        )
        is DeskPrompt.DeleteFolder -> ConfirmDialog(
            title = "Delete \"${p.folder.name}\"?",
            message = "The folder and its home-screen widgets go away. Your apps and files are not touched.",
            confirm = "Delete",
            onConfirm = { AppFolders.delete(p.folder.id); DesktopLayout.remove("folder:${p.folder.id}") },
            onDismiss = { prompt = null },
        )
        null -> Unit
    }
}

@Composable
private fun DesktopIconView(
    icon: DeskIcon,
    modifier: Modifier,
    onOpen: () -> Unit,
    onPrompt: (DeskPrompt) -> Unit,
    onDropped: (DragPayload) -> Unit,
) {
    val theme = LocalLauncherTheme.current
    val context = LocalContext.current
    val actions = LocalShellActions.current
    var menuOpen by remember { mutableStateOf(false) }
    val targetId = "desk-${icon.key}"
    val hover = isDropHover(targetId, 2)

    val accepts: (DragPayload) -> Boolean = { p ->
        when {
            icon.key == "builtin:bin" -> (p is FilesPayload) || (p is FolderItemPayload && p.folderId.isNotEmpty())
            icon.kind == DeskIcon.Kind.APP_FOLDER -> (p is FolderItemPayload && p.folderId != icon.folder!!.id) || p is FilesPayload
            icon.kind == DeskIcon.Kind.PATH && icon.file!!.isDirectory -> p is FilesPayload && p.files.none {
                it.absolutePath == icon.file.absolutePath || icon.file.absolutePath.startsWith(it.absolutePath + "/")
            }
            else -> false
        }
    }
    val verb: (DragPayload) -> String = { p ->
        when {
            icon.key == "builtin:bin" -> if (p is FolderItemPayload) "Remove from folder" else "Delete"
            icon.kind == DeskIcon.Kind.APP_FOLDER -> if (p is FilesPayload) "Add shortcut to ${icon.label}" else "Move to ${icon.label}"
            else -> "Move to ${icon.label}"
        }
    }

    Box(modifier) {
        Column(
            Modifier
                .width(80.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(if (hover) theme.accent.copy(alpha = 0.35f) else Color.Transparent)
                .dropTarget(targetId, 2, accepts = accepts, verb = verb) { p, _ -> onDropped(p) }
                .dragSource(
                    key = icon.key,
                    payload = {
                        if (icon.kind == DeskIcon.Kind.PATH) FilesPayload(listOf(icon.file!!), deskKey = icon.key, fromDir = icon.file.parentFile)
                        else DeskIconPayload(icon.key, icon.label)
                    },
                    onTap = onOpen,
                    onLongPress = { menuOpen = true },
                )
                .padding(vertical = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                when (icon.kind) {
                    DeskIcon.Kind.APP_FOLDER -> AppFolderGlyph(icon.folder!!, 48.dp)
                    DeskIcon.Kind.PATH -> {
                        val f = icon.file!!
                        if (f.isDirectory) Icon(Icons.Filled.Folder, null, Modifier.size(46.dp), tint = Color(0xFFFFCA28))
                        else Icon(fileIcon(f.name), null, Modifier.size(40.dp), tint = Color.White)
                    }
                    DeskIcon.Kind.BUILTIN -> {
                        val (vec, tint) = builtinIcon(icon.key)
                        Icon(vec, null, Modifier.size(42.dp), tint = tint)
                    }
                }
            }
            Spacer(Modifier.height(3.dp))
            Text(
                icon.label,
                style = TextStyle(color = Color.White, fontSize = 11.sp, shadow = Shadow(Color(0xB3000000), blurRadius = 4f)),
                textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 2.dp),
            )
        }

        Win11Menu(menuOpen, { menuOpen = false }) {
            MenuRow(Icons.Outlined.OpenInNew, "Open") { menuOpen = false; onOpen() }
            when (icon.kind) {
                DeskIcon.Kind.APP_FOLDER -> {
                    val f = icon.folder!!
                    MenuRow(Icons.Outlined.Widgets, "Add to home screen") { menuOpen = false; actions.pinToHomeScreen(f.id) }
                    MenuRow(Icons.Outlined.DriveFileRenameOutline, "Rename") { menuOpen = false; onPrompt(DeskPrompt.RenameFolder(f)) }
                    MenuDivider()
                    MenuRow(Icons.Outlined.Delete, "Delete folder", danger = true) { menuOpen = false; onPrompt(DeskPrompt.DeleteFolder(f)) }
                }
                DeskIcon.Kind.PATH -> {
                    val f = icon.file!!
                    MenuRow(Icons.Outlined.FolderOpen, "Show in File Explorer") { menuOpen = false; actions.openExplorer(f.parentFile?.absolutePath) }
                    MenuRow(Icons.Outlined.ContentCut, "Cut") { menuOpen = false; ExplorerClipboard.set(listOf(f), true) }
                    MenuRow(Icons.Outlined.ContentCopy, "Copy") { menuOpen = false; ExplorerClipboard.set(listOf(f), false) }
                    MenuRow(Icons.Outlined.DriveFileRenameOutline, "Rename") { menuOpen = false; onPrompt(DeskPrompt.RenameFile(f)) }
                    MenuRow(Icons.Outlined.Sell, "Properties & tags") { menuOpen = false; actions.openInspector(f.absolutePath) }
                    MenuDivider()
                    MenuRow(Icons.Outlined.Delete, "Delete", danger = true) {
                        menuOpen = false
                        FileOps.delete(listOf(f))
                        FsEvents.changed()
                    }
                }
                DeskIcon.Kind.BUILTIN -> if (icon.key == "builtin:bin") {
                    MenuRow(Icons.Outlined.DeleteForever, "Empty Recycle Bin") {
                        menuOpen = false
                        Trash.empty(); FsEvents.changed(); Toasts.success("Recycle Bin emptied")
                    }
                }
            }
        }
    }
}

/** Win11-style folder glyph showing up to four of the folder's apps. */
@Composable
fun AppFolderGlyph(folder: AppFolder, size: Dp) {
    val context = LocalContext.current
    val previews = folder.items.take(4)
    var bitmaps by remember(folder.items) { mutableStateOf<List<ImageBitmap?>>(emptyList()) }
    LaunchedEffect(folder.items) {
        bitmaps = withContext(Dispatchers.IO) {
            previews.map { item -> if (item.kind == "app") InstalledAppsRepository.iconBitmap(context, item.value)?.asImageBitmap() else null }
        }
    }
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.Folder, null, Modifier.size(size), tint = Color(folder.color))
        if (previews.isNotEmpty()) {
            Column(
                Modifier.padding(top = size * 0.18f).size(size * 0.56f).clip(RoundedCornerShape(4.dp))
                    .background(Color(0x40000000)).padding(2.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                for (row in 0..1) Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    for (col in 0..1) {
                        val i = row * 2 + col
                        Box(Modifier.size((size * 0.56f - 6.dp) / 2), contentAlignment = Alignment.Center) {
                            val bmp = bitmaps.getOrNull(i)
                            when {
                                bmp != null -> Image(bmp, null, Modifier.fillMaxSize())
                                i < previews.size -> Icon(
                                    if (previews[i].kind == "file") Icons.AutoMirrored.Outlined.InsertDriveFile else Icons.Outlined.Android,
                                    null, Modifier.fillMaxSize(), tint = Color.White,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun builtinIcon(key: String): Pair<ImageVector, Color> = when (key) {
    "builtin:files" -> Icons.Filled.Folder to Color(0xFFFFCA28)
    "builtin:thispc" -> Icons.Outlined.Computer to Color(0xFF4CC2FF)
    "builtin:bin" -> Icons.Outlined.Delete to Color(0xFFE2E8F0)
    "builtin:vaults" -> Icons.Outlined.Lock to Color(0xFFFF3355)
    "builtin:timeline" -> Icons.Outlined.Timeline to Color(0xFF6C63FF)
    else -> Icons.Filled.Folder to Color.White
}
