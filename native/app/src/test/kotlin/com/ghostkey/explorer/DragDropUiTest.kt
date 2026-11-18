package com.ghostkey.explorer

import android.os.Environment
import androidx.activity.ComponentActivity
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import com.ghostkey.explorer.shell.ShellScreen
import com.ghostkey.explorer.shell.assumeStorageAccessForTests
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

// Real gestures through the real shell: long-press + drag a file onto a folder.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xhdpi")
class DragDropUiTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private fun settle() {
        repeat(8) {
            Thread.sleep(120)
            compose.mainClock.advanceTimeBy(300)
            org.robolectric.shadows.ShadowLooper.idleMainLooper()
        }
    }

    @Test fun dragFileOntoFolderRowMovesIt() {
        val root = Environment.getExternalStorageDirectory()
        File(root, "Documents").mkdirs()
        val file = File(root, "drag-me.txt").apply { writeText("hi") }
        assumeStorageAccessForTests = true
        ShellRequests.pending = ShellRequests.OpenPath(root.absolutePath)
        compose.mainClock.autoAdvance = false
        compose.setContent { ShellScreen() }
        settle()

        val src = compose.onNodeWithText("drag-me.txt").getUnclippedBoundsInRoot()
        // The list row, not the sidebar entry (the one further right)
        val docs = compose.onAllNodesWithText("Documents")
        val dstBounds = (0 until docs.fetchSemanticsNodes().size).map { docs[it].getBoundsInRoot() }.maxBy { it.left }
        val density = compose.activity.resources.displayMetrics.density
        val from = Offset(((src.left + src.right) / 2).value * density, ((src.top + src.bottom) / 2).value * density)
        val to = Offset(((dstBounds.left + dstBounds.right) / 2).value * density, ((dstBounds.top + dstBounds.bottom) / 2).value * density)

        compose.onNodeWithText("drag-me.txt").performTouchInput {
            val local = Offset(width / 2f, height / 2f)
            down(local)
            advanceEventTime(900) // long press
            val steps = 12
            for (i in 1..steps) {
                moveBy(Offset((to.x - from.x) / steps, (to.y - from.y) / steps))
                advanceEventTime(16)
            }
            up()
        }
        settle()
        assertTrue("file should be inside Documents", File(root, "Documents/drag-me.txt").exists())
        assertFalse(file.exists())
    }

    /** Long-press [fromText] node (pick by index), drag to [to] (root px), release. */
    private fun dragNode(node: androidx.compose.ui.test.SemanticsNodeInteraction, to: Offset) {
        val b = node.getBoundsInRoot()
        val d = compose.activity.resources.displayMetrics.density
        val from = Offset(((b.left + b.right) / 2).value * d, ((b.top + b.bottom) / 2).value * d)
        node.performTouchInput {
            down(Offset(width / 2f, height / 2f))
            advanceEventTime(900)
            repeat(12) { moveBy(Offset((to.x - from.x) / 12, (to.y - from.y) / 12)); advanceEventTime(16) }
            up()
        }
        settle()
    }

    private fun centerPx(node: androidx.compose.ui.test.SemanticsNodeInteraction): Offset {
        val b = node.getBoundsInRoot()
        val d = compose.activity.resources.displayMetrics.density
        return Offset(((b.left + b.right) / 2).value * d, ((b.top + b.bottom) / 2).value * d)
    }

    @Test @Config(qualifiers = "w1000dp-h700dp-land-mdpi")
    fun dragBetweenDualPanes() {
        val root = Environment.getExternalStorageDirectory()
        val docs = File(root, "Documents").apply { mkdirs() }
        File(root, "Archive").mkdirs()
        File(docs, "pane-file.txt").writeText("x")
        assumeStorageAccessForTests = true
        ShellRequests.pending = ShellRequests.OpenPath(docs.absolutePath)
        compose.mainClock.autoAdvance = false
        compose.setContent { ShellScreen() }
        settle()
        // Right pane shows Home; drop onto its "Archive" row
        val target = compose.onAllNodesWithText("Archive")[0]
        dragNode(compose.onNodeWithText("pane-file.txt"), centerPx(target))
        assertTrue(File(root, "Archive/pane-file.txt").exists())
        assertFalse(File(docs, "pane-file.txt").exists())
    }

    @Test
    fun desktopFileToAppFolderAndRecycleBin() {
        val root = Environment.getExternalStorageDirectory()
        val desk = File(root, "Desktop").apply { mkdirs() }
        val idea = File(desk, "Idea.txt").apply { writeText("x") }
        assumeStorageAccessForTests = true
        val folder = com.ghostkey.explorer.data.AppFolders.create("Work")
        compose.mainClock.autoAdvance = false
        compose.setContent { ShellScreen() }
        settle()
        // Onto the app folder: adds a shortcut, file stays put
        dragNode(compose.onNodeWithText("Idea.txt"), centerPx(compose.onNodeWithText("Work")))
        val items = com.ghostkey.explorer.data.AppFolders.get(folder.id)!!.items
        assertTrue(items.any { it.kind == "file" && it.value == idea.absolutePath })
        assertTrue(idea.exists())
        // Onto the Recycle Bin: moved to the bin
        dragNode(compose.onNodeWithText("Idea.txt"), centerPx(compose.onNodeWithText("Recycle Bin")))
        assertFalse(idea.exists())
        assertTrue(com.ghostkey.explorer.files.Trash.listEntries().any { it.displayName == "Idea.txt" })
    }
}
