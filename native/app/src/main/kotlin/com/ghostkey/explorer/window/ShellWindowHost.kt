package com.ghostkey.explorer.window

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Science
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Timeline

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.compose.runtime.CompositionLocalProvider
import com.ghostkey.explorer.drag.LocalDropLayer
import com.ghostkey.explorer.drag.dropTarget
import com.ghostkey.explorer.theme.LocalLauncherTheme
import com.ghostkey.explorer.theme.ThemePreset
import kotlin.math.roundToInt

@Composable
fun ShellWindowHost(
    engine: WindowManagerEngine,
    modifier: Modifier = Modifier,
    content: @Composable (ShellWindow) -> Unit,
) {
    Box(modifier) {
        engine.windows.filter { it.state != WindowState.MINIMIZED }
            .sortedBy { it.zIndex }
            .forEach { window ->
                key(window.id) {
                    ShellWindowCard(
                        window = window,
                        content = content,
                        onFocus = { engine.reorderToFront(window.id) },
                        onMoveBy = { delta -> engine.moveWindowBy(window.id, delta) },
                        onResizeBy = { dw, dh -> engine.resizeWindowBy(window.id, dw, dh) },
                        onMinimize = { engine.toggleMinimize(window.id) },
                        onMaximizeRestore = {
                            if (window.state == WindowState.MAXIMIZED) engine.restoreWindow(window.id)
                            else engine.maximizeWindow(window.id)
                        },
                        onClose = { engine.closeWindow(window.id) },
                    )
                }
            }
    }
}

// Windows 11 window: Mica surface, 8dp corners, 1px stroke,
// title bar with left icon+title and flat caption buttons.
@Composable
fun ShellWindowCard(
    window: ShellWindow,
    content: @Composable (ShellWindow) -> Unit,
    onFocus: () -> Unit,
    onMoveBy: (Offset) -> Unit,
    onResizeBy: (androidx.compose.ui.unit.Dp, androidx.compose.ui.unit.Dp) -> Unit,
    onMinimize: () -> Unit,
    onMaximizeRestore: () -> Unit,
    onClose: () -> Unit,
) {
    val theme = LocalLauncherTheme.current
    val density = LocalDensity.current
    val isMaximized = window.state == WindowState.MAXIMIZED
    val corner = if (isMaximized) 0.dp else 8.dp
    val shape = RoundedCornerShape(corner)

    // Win11-style open animation: quick scale + fade in
    val spawn = androidx.compose.runtime.remember {
        androidx.compose.animation.core.Animatable(0f)
    }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        spawn.animateTo(
            1f,
            androidx.compose.animation.core.tween(120, easing = androidx.compose.animation.core.FastOutSlowInEasing),
        )
    }

    val frameModifier = if (isMaximized) {
        Modifier.fillMaxSize()
    } else {
        Modifier
            .offset { IntOffset(window.position.x.roundToInt(), window.position.y.roundToInt()) }
            .size(window.size)
    }

    Box(
        frameModifier
            .zIndex(window.zIndex.toFloat())
            .graphicsLayer {
                val s = 0.94f + 0.06f * spawn.value
                scaleX = s
                scaleY = s
                alpha = spawn.value
            }
            .shadow(if (isMaximized) 0.dp else 18.dp, shape)
            .clip(shape)
            .background(theme.windowSurface)
            .border(1.dp, theme.stroke, shape)
            // The window blocks drops onto whatever is underneath it
            .dropTarget("window-${window.id}", depth = 1000 + window.zIndex * 10, accepts = { false }) { _, _ -> }
            .pointerInput(Unit) { detectTapGestures { onFocus() } }
            // Long-press anywhere on the window body, then drag to move it
            .pointerInput(isMaximized) {
                detectDragGesturesAfterLongPress(
                    onDragStart = { onFocus() },
                    onDrag = { change, drag ->
                        change.consume()
                        if (!isMaximized) onMoveBy(drag)
                    },
                )
            },
    ) {
        Column(Modifier.fillMaxSize()) {
            // Title bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(36.dp)
                    .pointerInput(Unit) { detectTapGestures(onDoubleTap = { onMaximizeRestore() }, onTap = { onFocus() }) }
                    .pointerInput(isMaximized) {
                        detectDragGestures(
                            onDragStart = { onFocus() },
                            onDrag = { change, drag ->
                                change.consume()
                                if (!isMaximized) onMoveBy(drag)
                            },
                        )
                    },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val isMac = theme.preset == com.ghostkey.explorer.theme.ThemePreset.MACBOOK
                if (isMac) {
                    // macOS traffic lights, left side: close / minimize / zoom
                    Spacer(Modifier.width(12.dp))
                    TrafficLight(Color(0xFFFF5F57), "Close", onClose)
                    Spacer(Modifier.width(8.dp))
                    TrafficLight(Color(0xFFFEBC2E), "Minimize", onMinimize)
                    Spacer(Modifier.width(8.dp))
                    TrafficLight(Color(0xFF28C840), if (isMaximized) "Restore" else "Maximize", onMaximizeRestore)
                    Spacer(Modifier.width(12.dp))
                }
                if (!isMac) Spacer(Modifier.width(14.dp))
                Icon(
                    toIcon(window.contentType),
                    contentDescription = null,
                    modifier = Modifier.size(15.dp),
                    tint = when (window.contentType) {
                        WindowContentType.FILE_EXPLORER -> Color(0xFFFFCA28)
                        WindowContentType.VAULTS -> Color(0xFFFF3355)
                        WindowContentType.LIMBO -> Color(0xFFFF6B35)
                        else -> theme.text
                    },
                )
                Spacer(Modifier.width(9.dp))
                Text(
                    window.title,
                    fontSize = 12.sp,
                    color = theme.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (isMac) {
                    // mac windows have no right-side caption buttons
                    Spacer(Modifier.width(14.dp))
                } else {
                CaptionButton(onClick = onMinimize, contentDescription = "Minimize") { color ->
                    drawLine(
                        color,
                        Offset(size.width * 0.5f - 5.dp.toPx(), size.height * 0.5f),
                        Offset(size.width * 0.5f + 5.dp.toPx(), size.height * 0.5f),
                        strokeWidth = 1.2.dp.toPx(),
                    )
                }
                CaptionButton(
                    onClick = onMaximizeRestore,
                    contentDescription = if (isMaximized) "Restore" else "Maximize",
                ) { color ->
                    val s = 9.dp.toPx()
                    val stroke = Stroke(1.2.dp.toPx())
                    val r = androidx.compose.ui.geometry.CornerRadius(1.6.dp.toPx())
                    if (isMaximized) {
                        // Restore: two overlapping panes
                        val off = 2.4.dp.toPx()
                        drawRoundRect(
                            color,
                            topLeft = Offset((size.width - s) / 2f + off, (size.height - s) / 2f - off),
                            size = androidx.compose.ui.geometry.Size(s - off, s - off),
                            cornerRadius = r, style = stroke,
                        )
                        drawRoundRect(
                            color,
                            topLeft = Offset((size.width - s) / 2f, (size.height - s) / 2f + off * 0.4f),
                            size = androidx.compose.ui.geometry.Size(s - off, s - off),
                            cornerRadius = r, style = stroke,
                        )
                    } else {
                        drawRoundRect(
                            color,
                            topLeft = Offset((size.width - s) / 2f, (size.height - s) / 2f),
                            size = androidx.compose.ui.geometry.Size(s, s),
                            cornerRadius = r, style = stroke,
                        )
                    }
                }
                CaptionButton(onClick = onClose, contentDescription = "Close", isClose = true) { color ->
                    val s = 4.6.dp.toPx()
                    val cx = size.width * 0.5f
                    val cy = size.height * 0.5f
                    drawLine(color, Offset(cx - s, cy - s), Offset(cx + s, cy + s), 1.2.dp.toPx())
                    drawLine(color, Offset(cx - s, cy + s), Offset(cx + s, cy - s), 1.2.dp.toPx())
                }
                }
            }

            Box(Modifier.fillMaxSize().weight(1f)) {
                CompositionLocalProvider(LocalDropLayer provides 1000 + window.zIndex * 10) {
                    content(window)
                }
            }
        }

        // Resize button, bottom-right: drag it to resize width and height
        if (!isMaximized) {
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .size(34.dp)
                    .pointerInput(window.id) {
                        detectDragGestures(
                            onDragStart = { onFocus() },
                            onDrag = { change, drag ->
                                change.consume()
                                // Report the incremental delta; the engine adds
                                // it to the window's CURRENT size (no stale snapshot)
                                onResizeBy(drag.x.toDp(), drag.y.toDp())
                            },
                        )
                    },
            ) {
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .padding(bottom = 4.dp, end = 4.dp)
                        .size(22.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(theme.card.copy(alpha = 0.9f))
                        .border(1.dp, theme.stroke, RoundedCornerShape(6.dp)),
                ) {
                    // Double-headed diagonal arrow
                    Canvas(Modifier.align(Alignment.Center).size(11.dp)) {
                        val stroke = 1.4.dp.toPx()
                        val c = theme.textSecondary
                        val head = size.width * 0.38f
                        drawLine(c, Offset(size.width * 0.12f, size.height * 0.12f), Offset(size.width * 0.88f, size.height * 0.88f), stroke)
                        drawLine(c, Offset(size.width * 0.12f, size.height * 0.12f), Offset(size.width * 0.12f + head, size.height * 0.12f), stroke)
                        drawLine(c, Offset(size.width * 0.12f, size.height * 0.12f), Offset(size.width * 0.12f, size.height * 0.12f + head), stroke)
                        drawLine(c, Offset(size.width * 0.88f, size.height * 0.88f), Offset(size.width * 0.88f - head, size.height * 0.88f), stroke)
                        drawLine(c, Offset(size.width * 0.88f, size.height * 0.88f), Offset(size.width * 0.88f, size.height * 0.88f - head), stroke)
                    }
                }
            }
        }
    }
}

// macOS-style traffic-light window button (solid colored circle)
@Composable
private fun TrafficLight(color: Color, contentDescription: String, onClick: () -> Unit) {
    Box(
        Modifier
            .size(13.dp)
            .clip(androidx.compose.foundation.shape.CircleShape)
            .background(color)
            .border(0.5.dp, Color.Black.copy(alpha = 0.12f), androidx.compose.foundation.shape.CircleShape)
            .clickable { onClick() },
    )
}

@Composable
private fun CaptionButton(
    onClick: () -> Unit,
    contentDescription: String,
    isClose: Boolean = false,
    glyph: androidx.compose.ui.graphics.drawscope.DrawScope.(Color) -> Unit,
) {
    val theme = LocalLauncherTheme.current
    Box(
        Modifier
            .width(44.dp)
            .fillMaxHeight()
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        val color = if (isClose) theme.text else theme.text
        Canvas(Modifier.fillMaxSize()) { glyph(color) }
    }
}

fun toIcon(type: WindowContentType): androidx.compose.ui.graphics.vector.ImageVector = when (type) {
    WindowContentType.FILE_EXPLORER -> Icons.Filled.Folder
    WindowContentType.APP_FOLDER -> Icons.Outlined.Apps
    WindowContentType.TIMELINE -> Icons.Outlined.Timeline
    WindowContentType.VAULTS -> Icons.Outlined.Lock
    WindowContentType.LIMBO -> Icons.Outlined.Science
    WindowContentType.INSPECTOR -> Icons.Outlined.Sell
    WindowContentType.SETTINGS -> Icons.Outlined.Settings
}
