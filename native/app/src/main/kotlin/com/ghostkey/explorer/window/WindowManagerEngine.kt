package com.ghostkey.explorer.window

import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp

enum class WindowState { NORMAL, MINIMIZED, MAXIMIZED }

enum class WindowContentType { FILE_EXPLORER, APP_FOLDER, TIMELINE, VAULTS, LIMBO, INSPECTOR, SETTINGS }

data class ShellWindow(
    val id: String,
    val title: String,
    val contentType: WindowContentType,
    val state: WindowState = WindowState.NORMAL,
    val position: Offset = Offset(40f, 60f),
    val size: DpSize = DpSize(380.dp, 540.dp),
    val zIndex: Int = 0,
    val param: String? = null, // e.g. initial path for File Explorer
    val previousPosition: Offset? = null,
    val previousSize: DpSize? = null,
)

class WindowManagerEngine {
    private val _windows = mutableStateListOf<ShellWindow>()
    val windows: List<ShellWindow> get() = _windows
    private var _nextZ = 1
    var density = 2.75f

    fun setTitle(id: String, title: String) = updateWindow(id) { it.copy(title = title) }

    fun setParam(id: String, param: String?) = updateWindow(id) { it.copy(param = param) }

    val focusedWindowId: String?
        get() = _windows.filter { it.state != WindowState.MINIMIZED }.maxByOrNull { it.zIndex }?.id

    /** Usable desktop area in dp; set by the shell so new windows fit the screen. */
    var areaWidthDp = 400f
    var areaHeightDp = 700f

    fun openWindow(
        contentType: WindowContentType,
        title: String,
        param: String? = null,
        allowDuplicate: Boolean = false,
    ): ShellWindow {
        // Re-focus an existing window for the same thing instead of stacking duplicates
        _windows.firstOrNull {
            !allowDuplicate && it.contentType == contentType &&
                (if (param != null) it.param == param else it.title == title)
        }?.let { existing ->
            if (existing.state == WindowState.MINIMIZED) restoreWindow(existing.id)
            focusWindow(existing.id)
            return _windows.first { it.id == existing.id }
        }
        val w = minOf(areaWidthDp - 16f, if (contentType == WindowContentType.FILE_EXPLORER) 720f else 420f).coerceAtLeast(280f)
        val h = minOf(areaHeightDp - 24f, 640f).coerceAtLeast(320f)
        val step = (_windows.size % 5) * 18f * density
        val offset = Offset(8f * density + step, 12f * density + step)
        val win = ShellWindow(
            id = "${contentType.name}_${System.nanoTime()}",
            title = title, contentType = contentType, position = offset,
            size = DpSize(w.dp, h.dp),
            zIndex = _nextZ++, param = param,
            // Phones: explorer windows open maximized, like a full app
            state = if (contentType == WindowContentType.FILE_EXPLORER && areaWidthDp < 600f) WindowState.MAXIMIZED else WindowState.NORMAL,
            previousPosition = offset, previousSize = DpSize(w.dp, h.dp),
        )
        _windows.add(win)
        return win
    }

    fun focusWindow(id: String) {
        val idx = _windows.indexOfFirst { it.id == id }
        if (idx >= 0) _windows[idx] = _windows[idx].copy(zIndex = _nextZ++)
    }

    fun closeWindow(id: String) { _windows.removeIf { it.id == id } }

    fun toggleMinimize(id: String) = updateWindow(id) { w ->
        w.copy(state = if (w.state == WindowState.MINIMIZED) WindowState.NORMAL else WindowState.MINIMIZED)
    }

    fun minimizeAll() {
        for (i in _windows.indices) {
            _windows[i] = _windows[i].copy(state = WindowState.MINIMIZED)
        }
    }

    fun maximizeWindow(id: String) = updateWindow(id) { w ->
        w.copy(state = WindowState.MAXIMIZED, previousPosition = w.position, previousSize = w.size)
    }

    fun restoreWindow(id: String) = updateWindow(id) { w ->
        w.copy(
            state = WindowState.NORMAL,
            position = w.previousPosition ?: w.position,
            size = w.previousSize ?: w.size,
        )
    }

    fun moveWindow(id: String, newPosition: Offset) = updateWindow(id) { it.copy(position = newPosition) }

    // Relative move/resize: the transform reads the window's CURRENT state,
    // so rapid incremental drag deltas accumulate correctly even though the
    // gesture handler holds a stale snapshot of the window.
    fun moveWindowBy(id: String, delta: Offset) = updateWindow(id) { w ->
        w.copy(
            position = Offset(
                (w.position.x + delta.x).coerceAtLeast(0f),
                (w.position.y + delta.y).coerceAtLeast(0f),
            ),
        )
    }

    fun resizeWindow(id: String, newSize: DpSize) = updateWindow(id) { w ->
        w.copy(
            size = DpSize(
                newSize.width.coerceAtLeast(280.dp),
                newSize.height.coerceAtLeast(320.dp),
            ),
        )
    }

    fun resizeWindowBy(id: String, deltaWidth: androidx.compose.ui.unit.Dp, deltaHeight: androidx.compose.ui.unit.Dp) =
        updateWindow(id) { w ->
            w.copy(
                size = DpSize(
                    (w.size.width + deltaWidth).coerceIn(280.dp, 1400.dp),
                    (w.size.height + deltaHeight).coerceIn(320.dp, 2400.dp),
                ),
            )
        }

    fun reorderToFront(id: String) = focusWindow(id)

    private fun updateWindow(id: String, transform: (ShellWindow) -> ShellWindow) {
        val idx = _windows.indexOfFirst { it.id == id }
        if (idx >= 0) _windows[idx] = transform(_windows[idx])
    }
}
