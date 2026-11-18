package com.ghostkey.explorer.shell

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings as AndroidSettings
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.InsertDriveFile
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.ghostkey.explorer.ShellRequests
import com.ghostkey.explorer.apps.InstalledApp
import com.ghostkey.explorer.apps.InstalledAppsRepository
import com.ghostkey.explorer.data.AppFolders
import com.ghostkey.explorer.data.FolderItem
import com.ghostkey.explorer.data.Settings
import com.ghostkey.explorer.desktop.Desktop
import com.ghostkey.explorer.drag.DeskIconPayload
import com.ghostkey.explorer.drag.DragController
import com.ghostkey.explorer.drag.FilesPayload
import com.ghostkey.explorer.drag.FolderItemPayload
import com.ghostkey.explorer.drag.LocalDragController
import com.ghostkey.explorer.drag.dragSource
import com.ghostkey.explorer.explorer.FileExplorerWindow
import com.ghostkey.explorer.files.Trash
import com.ghostkey.explorer.intel.Limbo
import com.ghostkey.explorer.theme.BloomWallpaper
import com.ghostkey.explorer.theme.LauncherThemes
import com.ghostkey.explorer.theme.LocalLauncherTheme
import com.ghostkey.explorer.theme.NsTypography
import com.ghostkey.explorer.ui.AccentButton
import com.ghostkey.explorer.ui.StartLogo
import com.ghostkey.explorer.ui.SubtleButton
import com.ghostkey.explorer.ui.Toasts
import com.ghostkey.explorer.ui.Win11TextField
import com.ghostkey.explorer.widget.WidgetBindings
import com.ghostkey.explorer.window.ShellWindowHost
import com.ghostkey.explorer.window.WindowContentType
import com.ghostkey.explorer.window.WindowManagerEngine
import com.ghostkey.explorer.window.WindowState
import com.ghostkey.explorer.window.toIcon
import com.ghostkey.explorer.windows.AppFolderWindow
import com.ghostkey.explorer.windows.InspectorWindow
import com.ghostkey.explorer.windows.LimboWindow
import com.ghostkey.explorer.windows.SettingsWindow
import com.ghostkey.explorer.windows.TimelineWindow
import com.ghostkey.explorer.windows.VaultsWindow
import kotlinx.coroutines.delay
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

const val TASKBAR_HEIGHT_DP = 48

@Composable
fun ShellScreen() {
    val theme = LauncherThemes.fromPreset(Settings.themePreset)
    val engine = remember { WindowManagerEngine() }
    val drag = remember { DragController() }
    val context = LocalContext.current
    var startOpen by remember { mutableStateOf(false) }
    // Size the window area before any window opens (widget requests open
    // windows from an effect that can run before the layout pass)
    val config = androidx.compose.ui.platform.LocalConfiguration.current
    engine.areaWidthDp = config.screenWidthDp.toFloat()
    engine.areaHeightDp = (config.screenHeightDp - TASKBAR_HEIGHT_DP - 24).toFloat()
    engine.density = context.resources.displayMetrics.density

    val actions = remember(engine) {
        object : ShellActions {
            override fun openExplorer(path: String?, newWindow: Boolean) {
                val title = when {
                    path == null -> "File Explorer"
                    Trash.isTrash(File(path)) -> "Recycle Bin"
                    path == "/storage" -> "This PC"
                    else -> File(path).name
                }
                engine.openWindow(WindowContentType.FILE_EXPLORER, title, path, allowDuplicate = newWindow || path == null)
            }
            override fun openAppFolder(folderId: String) {
                engine.openWindow(WindowContentType.APP_FOLDER, AppFolders.get(folderId)?.name ?: "Folder", folderId)
            }
            override fun openInspector(path: String) {
                engine.openWindow(WindowContentType.INSPECTOR, "Properties", path)
            }
            override fun openVaults(addPath: String?) {
                val existing = engine.windows.firstOrNull { it.contentType == WindowContentType.VAULTS }
                if (existing != null) {
                    engine.setParam(existing.id, addPath)
                    engine.focusWindow(existing.id)
                    if (existing.state == WindowState.MINIMIZED) engine.restoreWindow(existing.id)
                } else engine.openWindow(WindowContentType.VAULTS, "Vaults", addPath, allowDuplicate = true)
            }
            override fun openLimbo() { engine.openWindow(WindowContentType.LIMBO, "Limbo") }
            override fun openTimeline() { engine.openWindow(WindowContentType.TIMELINE, "Timeline") }
            override fun openSettings() { engine.openWindow(WindowContentType.SETTINGS, "Settings") }
            override fun pinToHomeScreen(folderId: String) {
                val name = AppFolders.get(folderId)?.name ?: "folder"
                if (WidgetBindings.requestPin(context, folderId)) {
                    Toasts.show("Confirm to place \"$name\" on your home screen")
                } else {
                    Toasts.show("Your launcher can't place widgets for apps. Long-press your home screen → Widgets → Ghost Key, then pick \"$name\".")
                }
            }
            override fun closeWindow(windowId: String) = engine.closeWindow(windowId)
            override fun setWindowTitle(windowId: String, title: String) = engine.setTitle(windowId, title)
        }
    }

    // Requests from widgets (open a folder / a path)
    val request = ShellRequests.pending
    LaunchedEffect(request) {
        when (val r = request) {
            is ShellRequests.OpenFolder -> actions.openAppFolder(r.folderId)
            is ShellRequests.OpenPath -> actions.openExplorer(r.path)
            null -> Unit
        }
        ShellRequests.pending = null
    }

    // Storage permission: re-check whenever the app comes back to the front
    var hasAccess by remember { mutableStateOf(hasAllFilesAccess()) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) hasAccess = hasAllFilesAccess() }
        lifecycle.addObserver(obs)
        onDispose { lifecycle.removeObserver(obs) }
    }

    MaterialTheme(colorScheme = if (theme.isDark) darkColorScheme() else lightColorScheme(), typography = NsTypography) {
        CompositionLocalProvider(
            LocalLauncherTheme provides theme,
            LocalShellActions provides actions,
            LocalDragController provides drag,
        ) {
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
                val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
                val bottomBar = TASKBAR_HEIGHT_DP.dp + 1.dp + navBottom
                val density = LocalDensity.current
                engine.areaWidthDp = maxWidth.value
                engine.areaHeightDp = (maxHeight - statusTop - bottomBar).value
                engine.density = density.density

                BloomWallpaper(isDark = theme.isDark, accent = theme.accent, modifier = Modifier.fillMaxSize())

                Box(Modifier.fillMaxSize().padding(top = statusTop, bottom = bottomBar)) {
                    Desktop(Modifier.fillMaxSize())
                    ShellWindowHost(engine, Modifier.fillMaxSize()) { win ->
                        when (win.contentType) {
                            WindowContentType.FILE_EXPLORER -> FileExplorerWindow(win)
                            WindowContentType.APP_FOLDER -> AppFolderWindow(win)
                            WindowContentType.TIMELINE -> TimelineWindow(win)
                            WindowContentType.VAULTS -> VaultsWindow(win)
                            WindowContentType.LIMBO -> LimboWindow(win)
                            WindowContentType.INSPECTOR -> InspectorWindow(win)
                            WindowContentType.SETTINGS -> SettingsWindow(win)
                        }
                    }
                }

                // Start menu (fades while you drag an app out of it onto a folder)
                AnimatedVisibility(
                    visible = startOpen,
                    enter = fadeIn() + slideInVertically { it / 6 },
                    exit = fadeOut() + slideOutVertically { it / 6 },
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = bottomBar + 8.dp).zIndex(5000f),
                ) {
                    StartMenu(
                        modifier = Modifier
                            .width(minOf(maxWidth - 16.dp, 560.dp))
                            .heightIn(max = maxHeight - bottomBar - statusTop - 24.dp)
                            .alpha(if (drag.isDragging) 0.18f else 1f),
                        engineActions = actions,
                        onClose = { startOpen = false },
                    )
                }
                if (startOpen && !drag.isDragging) {
                    // Tap outside closes Start
                    Box(
                        Modifier.fillMaxSize().padding(bottom = bottomBar).zIndex(4999f)
                            .pointerInput(Unit) { detectTapGestures { startOpen = false } },
                    )
                }

                Taskbar(
                    engine = engine,
                    actions = actions,
                    startOpen = startOpen,
                    onStart = { startOpen = !startOpen },
                    modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().zIndex(6000f),
                )

                ToastHost(Modifier.align(Alignment.BottomCenter).padding(bottom = bottomBar + 12.dp).zIndex(7000f))
                DragOverlay(Modifier.zIndex(8000f))

                if (!hasAccess) PermissionPrompt(onSkip = { hasAccess = true })
            }
        }
    }
}

/** Screenshot tests render the shell without the first-run prompt. */
internal var assumeStorageAccessForTests = false

private fun hasAllFilesAccess(): Boolean = assumeStorageAccessForTests ||
    Build.VERSION.SDK_INT < Build.VERSION_CODES.R || Environment.isExternalStorageManager()

// ————————————————————————— Drag ghost —————————————————————————

@Composable
private fun DragOverlay(modifier: Modifier) {
    val drag = LocalDragController.current
    val theme = LocalLauncherTheme.current
    val p = drag.payload ?: return
    val target = drag.hovered
    val at = drag.pointer
    Box(modifier.fillMaxSize()) {
        Row(
            Modifier
                .offset { IntOffset((at.x - 40.dp.toPx()).roundToInt(), (at.y - 64.dp.toPx()).roundToInt()) }
                .shadow(10.dp, RoundedCornerShape(8.dp))
                .clip(RoundedCornerShape(8.dp))
                .background(theme.menuSurface)
                .border(1.dp, if (target != null) theme.accent else theme.stroke, RoundedCornerShape(8.dp))
                .padding(horizontal = 10.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val icon: ImageVector = when (p) {
                is FilesPayload -> if (p.files.size == 1 && p.files.first().isDirectory) Icons.Filled.Folder else Icons.AutoMirrored.Outlined.InsertDriveFile
                is FolderItemPayload -> if (p.item.kind == "app") Icons.Outlined.Apps else Icons.Outlined.Shortcut
                is DeskIconPayload -> Icons.Outlined.OpenWith
            }
            Box {
                Icon(icon, null, Modifier.size(20.dp), tint = if (icon == Icons.Filled.Folder) Color(0xFFFFCA28) else theme.text)
                if (p.count > 1) {
                    Text(
                        "${p.count}", color = theme.accentText, fontSize = 9.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.align(Alignment.TopEnd).offset(6.dp, (-6).dp).clip(CircleShape)
                            .background(theme.accent).padding(horizontal = 4.dp),
                    )
                }
            }
            Spacer(Modifier.width(8.dp))
            Column {
                Text(p.label, color = theme.text, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 180.dp))
                Text(
                    target?.verb?.invoke(p) ?: "Drop on a folder",
                    color = if (target != null) theme.accent else theme.textSecondary, fontSize = 10.sp, maxLines = 1,
                )
            }
        }
    }
}

// ————————————————————————— Toasts —————————————————————————

@Composable
private fun ToastHost(modifier: Modifier) {
    val theme = LocalLauncherTheme.current
    val t = Toasts.current
    LaunchedEffect(t?.id) {
        val id = t?.id ?: return@LaunchedEffect
        delay(3200)
        Toasts.dismiss(id)
    }
    AnimatedVisibility(t != null, enter = fadeIn(), exit = fadeOut(), modifier = modifier) {
        val toast = t ?: return@AnimatedVisibility
        Row(
            Modifier.padding(horizontal = 16.dp).shadow(12.dp, RoundedCornerShape(8.dp)).clip(RoundedCornerShape(8.dp))
                .background(theme.menuSurface)
                .border(1.dp, when (toast.kind) {
                    Toasts.Kind.ERROR -> Color(0xFFFF5F57)
                    Toasts.Kind.SUCCESS -> Color(0xFF00C853)
                    Toasts.Kind.INFO -> theme.stroke
                }, RoundedCornerShape(8.dp))
                .clickable { Toasts.dismiss(toast.id) }
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                when (toast.kind) {
                    Toasts.Kind.ERROR -> Icons.Outlined.ErrorOutline
                    Toasts.Kind.SUCCESS -> Icons.Outlined.CheckCircle
                    Toasts.Kind.INFO -> Icons.Outlined.Info
                },
                null, Modifier.size(16.dp),
                tint = when (toast.kind) {
                    Toasts.Kind.ERROR -> Color(0xFFFF5F57)
                    Toasts.Kind.SUCCESS -> Color(0xFF00C853)
                    Toasts.Kind.INFO -> theme.accent
                },
            )
            Spacer(Modifier.width(10.dp))
            Text(toast.message, color = theme.text, fontSize = 12.sp)
        }
    }
}

// ————————————————————————— Taskbar —————————————————————————

@Composable
private fun Taskbar(
    engine: WindowManagerEngine,
    actions: ShellActions,
    startOpen: Boolean,
    onStart: () -> Unit,
    modifier: Modifier,
) {
    val theme = LocalLauncherTheme.current
    var now by remember { mutableStateOf(Date()) }
    LaunchedEffect(Unit) {
        while (!assumeStorageAccessForTests) {
            now = Date()
            delay(60_000L - System.currentTimeMillis() % 60_000L)
        }
    }
    val focused = engine.focusedWindowId
    Column(modifier.background(theme.taskbar)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(theme.stroke))
        Row(Modifier.fillMaxWidth().height(TASKBAR_HEIGHT_DP.dp), verticalAlignment = Alignment.CenterVertically) {
            BoxWithConstraints(Modifier.weight(1f).fillMaxHeight()) {
                val budget = ((maxWidth / 46.dp).toInt() - 3).coerceAtLeast(1)
                Row(Modifier.align(Alignment.Center), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    TaskbarButton(onClick = onStart, indicator = if (startOpen) 2 else 0) { StartLogo(22.dp) }
                    TaskbarButton(onClick = { actions.openExplorer(null, newWindow = true) }) {
                        Icon(Icons.Filled.Folder, "File Explorer", Modifier.size(22.dp), tint = Color(0xFFFFCA28))
                    }
                    engine.windows.take(budget).forEach { win ->
                        TaskbarButton(
                            onClick = {
                                when {
                                    win.state == WindowState.MINIMIZED -> { engine.toggleMinimize(win.id); engine.focusWindow(win.id) }
                                    win.id == focused -> engine.toggleMinimize(win.id)
                                    else -> engine.focusWindow(win.id)
                                }
                            },
                            indicator = if (win.id == focused && win.state != WindowState.MINIMIZED) 2 else 1,
                        ) {
                            Icon(
                                toIcon(win.contentType), win.title, Modifier.size(21.dp),
                                tint = when (win.contentType) {
                                    WindowContentType.FILE_EXPLORER -> Color(0xFFFFCA28)
                                    WindowContentType.APP_FOLDER -> Color(AppFolders.get(win.param ?: "")?.color ?: 0xFFFFCA28)
                                    WindowContentType.VAULTS -> Color(0xFFFF3355)
                                    WindowContentType.LIMBO -> Color(0xFFFF6B35)
                                    else -> theme.text
                                },
                            )
                        }
                    }
                }
            }
            Column(
                Modifier.clip(RoundedCornerShape(4.dp)).clickable { actions.openTimeline() }.padding(horizontal = 7.dp, vertical = 5.dp),
                horizontalAlignment = Alignment.End,
            ) {
                Text(SimpleDateFormat("h:mm a", Locale.getDefault()).format(now), color = theme.text, fontSize = 12.sp, lineHeight = 15.sp, textAlign = TextAlign.End)
                Text(SimpleDateFormat("M/d/yyyy", Locale.getDefault()).format(now), color = theme.text, fontSize = 12.sp, lineHeight = 15.sp, textAlign = TextAlign.End)
            }
            // Show-desktop sliver
            Box(Modifier.fillMaxHeight().width(10.dp).clickable { engine.minimizeAll() }) {
                Box(Modifier.align(Alignment.CenterStart).fillMaxHeight().padding(vertical = 12.dp).width(1.dp).background(theme.divider))
            }
        }
        Box(Modifier.fillMaxWidth().windowInsetsBottomHeight(WindowInsets.navigationBars))
    }
}

@Composable
private fun TaskbarButton(onClick: () -> Unit, indicator: Int = 0, content: @Composable () -> Unit) {
    val theme = LocalLauncherTheme.current
    Box(Modifier.size(44.dp).clip(RoundedCornerShape(4.dp)).clickable { onClick() }, contentAlignment = Alignment.Center) {
        content()
        when (indicator) {
            2 -> Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 3.dp).size(16.dp, 3.dp).background(theme.accent, RoundedCornerShape(2.dp)))
            1 -> Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 3.dp).size(6.dp, 3.dp).background(theme.textSecondary, RoundedCornerShape(2.dp)))
        }
    }
}

// ————————————————————————— Start menu —————————————————————————

@Composable
private fun StartMenu(modifier: Modifier, engineActions: ShellActions, onClose: () -> Unit) {
    val theme = LocalLauncherTheme.current
    val context = LocalContext.current
    var query by remember { mutableStateOf("") }
    var apps by remember { mutableStateOf<List<InstalledApp>>(emptyList()) }
    LaunchedEffect(Unit) { apps = InstalledAppsRepository.loadApps(context) }
    val shown = if (query.isBlank()) apps else apps.filter { it.label.contains(query.trim(), true) }

    Column(
        modifier
            .shadow(24.dp, RoundedCornerShape(8.dp))
            .clip(RoundedCornerShape(8.dp))
            .background(theme.menuSurface)
            .border(1.dp, theme.stroke, RoundedCornerShape(8.dp))
            .pointerInput(Unit) { detectTapGestures { } }
            .padding(16.dp),
    ) {
        Win11TextField(query, { query = it }, placeholder = "Search apps")
        Spacer(Modifier.height(14.dp))
        Text("Pinned", color = theme.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            PinnedTile(Icons.Filled.Folder, "Explorer", Color(0xFFFFCA28)) { onClose(); engineActions.openExplorer(null, true) }
            PinnedTile(Icons.Outlined.Timeline, "Timeline", Color(0xFF6C63FF)) { onClose(); engineActions.openTimeline() }
            PinnedTile(Icons.Outlined.Lock, "Vaults", Color(0xFFFF3355)) { onClose(); engineActions.openVaults() }
            PinnedTile(Icons.Outlined.Science, "Limbo", Color(0xFFFF6B35)) { onClose(); engineActions.openLimbo() }
            PinnedTile(Icons.Outlined.Settings, "Settings", theme.text) { onClose(); engineActions.openSettings() }
        }
        if (AppFolders.folders.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Text("App folders", color = theme.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                AppFolders.folders.forEach { f ->
                    PinnedTile(Icons.Filled.Folder, f.name, Color(f.color)) { onClose(); engineActions.openAppFolder(f.id) }
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("All apps", color = theme.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text("Hold & drag an app onto a folder", color = theme.textSecondary, fontSize = 10.sp)
        }
        Spacer(Modifier.height(6.dp))
        LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false).heightIn(min = 120.dp)) {
            items(shown, key = { it.packageName }) { app ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(4.dp))
                        .dragSource(
                            key = app.packageName,
                            payload = { FolderItemPayload("", FolderItem("app", app.packageName, app.label)) },
                            onTap = { onClose(); InstalledAppsRepository.launch(context, app.packageName) },
                            onLongPress = { },
                        )
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (app.icon != null) Image(app.icon, null, Modifier.size(26.dp)) else Box(Modifier.size(26.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(app.label, color = theme.text, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun PinnedTile(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    val theme = LocalLauncherTheme.current
    Column(
        Modifier.width(64.dp).clip(RoundedCornerShape(4.dp)).clickable { onClick() }.padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, null, Modifier.size(26.dp), tint = tint)
        Spacer(Modifier.height(4.dp))
        Text(label, color = theme.text, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// ————————————————————————— First run —————————————————————————

@Composable
private fun PermissionPrompt(onSkip: () -> Unit) {
    val theme = LocalLauncherTheme.current
    val context = LocalContext.current
    Box(Modifier.fillMaxSize().background(Color(0x99000000)).pointerInput(Unit) { detectTapGestures { } }.zIndex(9000f), contentAlignment = Alignment.Center) {
        Column(
            Modifier.width(330.dp).clip(RoundedCornerShape(8.dp)).background(theme.windowSurface)
                .border(1.dp, theme.stroke, RoundedCornerShape(8.dp)).padding(22.dp),
        ) {
            Icon(Icons.Filled.Folder, null, Modifier.size(36.dp), tint = Color(0xFFFFCA28))
            Spacer(Modifier.height(10.dp))
            Text("Welcome to Ghost Key", color = theme.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            Text(
                "To browse, move and organize your files, Ghost Key needs \"All files access\". No root needed. " +
                    "Nothing is scanned in the background or uploaded anywhere.",
                color = theme.textSecondary, fontSize = 13.sp,
            )
            Spacer(Modifier.height(18.dp))
            AccentButton("Grant access", onClick = {
                runCatching {
                    context.startActivity(
                        Intent(AndroidSettings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${context.packageName}"))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    )
                }.onFailure {
                    context.startActivity(Intent(AndroidSettings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            SubtleButton("Not now", onClick = onSkip, modifier = Modifier.fillMaxWidth())
        }
    }
}
