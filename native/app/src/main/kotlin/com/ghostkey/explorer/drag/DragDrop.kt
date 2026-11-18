package com.ghostkey.explorer.drag

import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalHapticFeedback
import com.ghostkey.explorer.data.FolderItem
import java.io.File

// One drag-and-drop system for the whole shell. Anything can be dragged —
// files out of an explorer pane, icons on the desktop, apps inside a folder —
// and dropped on anything that registers as a target: folders in either
// pane, breadcrumbs, the sidebar, desktop folders, app folders, the Recycle
// Bin or empty desktop space. Targets stack by layer (windows above the
// desktop, the focused window above others); the highest one under the
// finger wins, so a window always blocks what's underneath it.
sealed interface DragPayload {
    val label: String
    val count: Int
}

/** Real files/folders. [deskKey] is set when they were picked up from the desktop. */
data class FilesPayload(
    val files: List<File>,
    val deskKey: String? = null,
    val fromDir: File? = null,
) : DragPayload {
    override val label: String get() = if (files.size == 1) files.first().name else "${files.size} items"
    override val count: Int get() = files.size
}

/** An item (app or file shortcut) dragged out of an app folder. */
data class FolderItemPayload(val folderId: String, val item: FolderItem) : DragPayload {
    override val label: String get() = item.label
    override val count: Int get() = 1
}

/** A desktop icon that isn't a file: a built-in or an app folder. */
data class DeskIconPayload(val deskKey: String, override val label: String) : DragPayload {
    override val count: Int get() = 1
}

class DropTarget(
    val id: String,
    val layer: Int,
    var bounds: Rect,
    val accepts: (DragPayload) -> Boolean,
    val verb: (DragPayload) -> String,
    val onDrop: (DragPayload, Offset) -> Unit,
)

class DragController {
    var payload by mutableStateOf<DragPayload?>(null)
        private set
    var pointer by mutableStateOf(Offset.Zero)
        private set
    /** Where the finger sits inside the dragged element, so it doesn't jump. */
    var grabOffset by mutableStateOf(Offset.Zero)
        private set
    private val targets = mutableStateMapOf<String, DropTarget>()

    val isDragging: Boolean get() = payload != null

    fun register(t: DropTarget) { targets[t.id] = t }
    fun unregister(id: String) { targets.remove(id) }
    fun updateBounds(id: String, r: Rect) { targets[id]?.bounds = r }

    /** The topmost target under the finger (null if none). */
    val hovered: DropTarget?
        get() {
            val p = payload ?: return null
            return targets.values.filter { it.bounds.contains(pointer) }.maxByOrNull { it.layer }
                ?.takeIf { it.accepts(p) }
        }

    fun start(p: DragPayload, at: Offset, grab: Offset) {
        payload = p
        pointer = at
        grabOffset = grab
    }

    fun moveTo(at: Offset) { pointer = at }

    /** Drop on the hovered target; false if nothing accepted it. */
    fun drop(): Boolean {
        val p = payload ?: return false
        val target = hovered
        val at = pointer
        payload = null
        return if (target != null) { target.onDrop(p, at); true } else false
    }

    fun cancel() { payload = null }
}

val LocalDragController = compositionLocalOf { DragController() }

/** Base layer for targets inside the current window (0 = desktop). */
val LocalDropLayer = compositionLocalOf { 0 }

/**
 * Register this element as a drop target. [depth] orders targets inside the
 * same window (background < row < breadcrumb).
 */
fun Modifier.dropTarget(
    id: String,
    depth: Int = 1,
    accepts: (DragPayload) -> Boolean,
    verb: (DragPayload) -> String = { "Move to" },
    onDrop: (DragPayload, Offset) -> Unit,
): Modifier = composed {
    val controller = LocalDragController.current
    val layer = LocalDropLayer.current + depth
    val acceptsState by rememberUpdatedState(accepts)
    val verbState by rememberUpdatedState(verb)
    val dropState by rememberUpdatedState(onDrop)
    val key = "$id@$layer"
    DisposableEffect(key) {
        controller.register(
            DropTarget(key, layer, Rect.Zero, { acceptsState(it) }, { verbState(it) }, { p, at -> dropState(p, at) }),
        )
        onDispose { controller.unregister(key) }
    }
    onGloballyPositioned { controller.updateBounds(key, it.boundsInRoot()) }
}

/** True while something droppable is held over this target. */
@Composable
fun isDropHover(id: String, depth: Int = 1): Boolean {
    val controller = LocalDragController.current
    val layer = LocalDropLayer.current + depth
    return controller.isDragging && controller.hovered?.id == "$id@$layer"
}

/**
 * Tap, long-press and long-press-drag on one element, the way NeverSoft 11's
 * desktop icons behave: quick tap = [onTap]; hold and release = [onLongPress]
 * (menus / selection); hold and move past a slop = drag [payload].
 * The drag detector consumes the release, so a drag never also taps.
 */
fun Modifier.dragSource(
    key: Any,
    payload: () -> DragPayload?,
    onTap: () -> Unit,
    onLongPress: () -> Unit,
    onDoubleTap: (() -> Unit)? = null,
    onDragEnd: ((dropped: Boolean, at: Offset) -> Unit)? = null,
): Modifier = composed {
    val controller = LocalDragController.current
    val haptics = LocalHapticFeedback.current
    val coords = remember { arrayOfNulls<LayoutCoordinates>(1) }
    val tapState by rememberUpdatedState(onTap)
    val longState by rememberUpdatedState(onLongPress)
    val doubleState by rememberUpdatedState(onDoubleTap)
    val payloadState by rememberUpdatedState(payload)
    val endState by rememberUpdatedState(onDragEnd)
    this
        .onGloballyPositioned { coords[0] = it }
        .pointerInput(key, onDoubleTap != null) {
            if (doubleState != null) {
                detectTapGestures(onTap = { tapState() }, onDoubleTap = { doubleState?.invoke() })
            } else {
                detectTapGestures(onTap = { tapState() })
            }
        }
        .pointerInput(key) {
            var moved = false
            var pending = Offset.Zero
            var grab = Offset.Zero
            val slop = viewConfiguration.touchSlop * 2f
            detectDragGesturesAfterLongPress(
                onDragStart = { pos ->
                    moved = false
                    pending = Offset.Zero
                    grab = pos
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                },
                onDrag = { change, amount ->
                    change.consume()
                    val c = coords[0]
                    if (!moved) {
                        pending += amount
                        if (pending.getDistance() > slop && c != null) {
                            val p = payloadState()
                            if (p != null) {
                                moved = true
                                controller.start(p, c.localToRoot(change.position), grab)
                            }
                        }
                    } else if (c != null && c.isAttached) {
                        controller.moveTo(c.localToRoot(change.position))
                    }
                },
                onDragEnd = {
                    if (moved) {
                        val at = controller.pointer
                        val dropped = controller.drop()
                        endState?.invoke(dropped, at)
                    } else {
                        longState()
                    }
                },
                onDragCancel = {
                    if (moved) {
                        controller.cancel()
                        endState?.invoke(false, controller.pointer)
                    }
                },
            )
        }
}
