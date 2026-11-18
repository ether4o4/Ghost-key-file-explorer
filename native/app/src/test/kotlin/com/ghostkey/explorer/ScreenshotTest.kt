package com.ghostkey.explorer

import android.graphics.Bitmap
import android.os.Environment
import androidx.activity.ComponentActivity
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import com.ghostkey.explorer.data.AppFolders
import com.ghostkey.explorer.data.FolderItem
import com.ghostkey.explorer.intel.FileIndex
import com.ghostkey.explorer.shell.ShellScreen
import com.ghostkey.explorer.shell.assumeStorageAccessForTests
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

// Renders the real shell headlessly and writes PNGs to docs/screenshots.
// Run with: ./gradlew testDebugUnitTest -Pscreenshots --tests '*ScreenshotTest*'
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ScreenshotTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private fun seedFiles() {
        val root = Environment.getExternalStorageDirectory()
        listOf("Download", "Documents", "Pictures", "DCIM", "Music", "Movies", "Desktop", "Projects", "WhatsApp").forEach { File(root, it).mkdirs() }
        File(root, "Documents/Budget 2026.xlsx").writeText("x".repeat(48_000))
        File(root, "Documents/Notes.txt").writeText("Call Jane Smith 555-201-3344")
        File(root, "Download/photos-backup.zip").writeBytes(ByteArray(2_400_000))
        File(root, "Download/Resume.pdf").writeBytes(ByteArray(180_000))
        File(root, "Pictures/Beach.jpg").writeBytes(ByteArray(3_100_000))
        File(root, "Music/Mixtape.mp3").writeBytes(ByteArray(5_600_000))
        File(root, "Desktop/Ideas.txt").writeText("ideas")
        File(root, "Desktop/School").mkdirs()
        File(root, "Projects/ghost-key").mkdirs()
        File(root, "report-final.docx").writeBytes(ByteArray(64_000))
        FileIndex.ensure(File(root, "Documents/Notes.txt"))
        if (AppFolders.folders.isEmpty()) {
            AppFolders.create("Social", 0xFF4CC2FF).also {
                AppFolders.addItems(it.id, listOf(FolderItem("file", File(root, "Pictures/Beach.jpg").absolutePath, "Beach.jpg")))
            }
            AppFolders.create("Work", 0xFFFFCA28).also {
                AppFolders.addItems(it.id, listOf(
                    FolderItem("file", File(root, "Documents/Budget 2026.xlsx").absolutePath, "Budget 2026.xlsx"),
                    FolderItem("file", File(root, "Download/Resume.pdf").absolutePath, "Resume.pdf"),
                ))
            }
            AppFolders.create("Games", 0xFF00C853)
        }
    }

    private fun settle() {
        // The taskbar clock ticks forever, so time is advanced by hand
        repeat(6) {
            Thread.sleep(150) // let IO work (listings, icons) finish
            compose.mainClock.advanceTimeBy(400)
            org.robolectric.shadows.ShadowLooper.idleMainLooper()
        }
    }

    private fun shoot(name: String) {
        settle()
        val view = compose.activity.window.decorView
        val bmp = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        compose.runOnUiThread { view.draw(android.graphics.Canvas(bmp)) }
        val dir = File(System.getProperty("screenshots.dir") ?: "build/screenshots").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun launch(request: ShellRequests.Request?) {
        assumeStorageAccessForTests = true
        seedFiles()
        ShellRequests.pending = request
        compose.mainClock.autoAdvance = false
        compose.setContent { ShellScreen() }
    }

    @Test @Config(qualifiers = "w411dp-h891dp-xhdpi")
    fun phoneDesktop() { launch(null); shoot("phone-desktop") }

    @Test @Config(qualifiers = "w411dp-h891dp-xhdpi")
    fun phoneExplorer() {
        launch(ShellRequests.OpenPath(Environment.getExternalStorageDirectory().absolutePath))
        shoot("phone-explorer")
    }

    @Test @Config(qualifiers = "w411dp-h891dp-xhdpi")
    fun phoneAppFolder() {
        launch(null)
        settle()
        ShellRequests.pending = ShellRequests.OpenFolder(AppFolders.folders.first { it.name == "Work" }.id)
        shoot("phone-app-folder")
    }

    @Test @Config(qualifiers = "w1000dp-h700dp-land-mdpi")
    fun tabletDualPane() {
        launch(ShellRequests.OpenPath(File(Environment.getExternalStorageDirectory(), "Documents").absolutePath))
        shoot("tablet-dual-pane")
    }
}

// The home-screen widget's real layout, filled the way the widget service fills it.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h400dp-xhdpi")
class WidgetScreenshotTest {
    @Test fun widgetPreview() {
        val ctx = org.robolectric.RuntimeEnvironment.getApplication()
        val inflater = android.view.LayoutInflater.from(ctx)
        val root = android.widget.FrameLayout(ctx).apply { setBackgroundColor(0xFF1B3A5C.toInt()); setPadding(40, 40, 40, 40) }
        val widget = inflater.inflate(R.layout.widget_folder, root, false)
        widget.findViewById<android.widget.TextView>(R.id.widget_title).text = "Social"
        widget.findViewById<android.widget.ImageView>(R.id.widget_folder_icon).setColorFilter(0xFF4CC2FF.toInt())
        widget.findViewById<android.view.View>(R.id.widget_empty).visibility = android.view.View.GONE
        val labels = listOf("Messages", "Camera", "Photos", "Music", "Notes.txt", "Projects", "Maps", "Mail")
        val colors = listOf(0xFF00C853, 0xFF6C63FF, 0xFFFF6B35, 0xFFFF3355, 0, 0, 0xFF00D4FF, 0xFFFFD700)
        widget.findViewById<android.widget.GridView>(R.id.widget_grid).adapter = object : android.widget.BaseAdapter() {
            override fun getCount() = labels.size
            override fun getItem(p: Int) = labels[p]
            override fun getItemId(p: Int) = p.toLong()
            override fun getView(p: Int, convert: android.view.View?, parent: android.view.ViewGroup): android.view.View {
                val v = inflater.inflate(R.layout.widget_folder_item, parent, false)
                v.findViewById<android.widget.TextView>(R.id.item_label).text = labels[p]
                val icon = v.findViewById<android.widget.ImageView>(R.id.item_icon)
                when {
                    labels[p] == "Projects" -> { icon.setImageResource(R.drawable.ic_folder_glyph); icon.setColorFilter(0xFFFFCA28.toInt()) }
                    colors[p] == 0L -> icon.setImageResource(R.drawable.ic_file_glyph)
                    else -> icon.setImageDrawable(android.graphics.drawable.GradientDrawable().apply {
                        cornerRadius = 22f; setColor(colors[p].toInt())
                    })
                }
                return v
            }
        }
        root.addView(widget, android.widget.FrameLayout.LayoutParams(740, 420))
        val spec = android.view.View.MeasureSpec.makeMeasureSpec(822, android.view.View.MeasureSpec.EXACTLY)
        val hspec = android.view.View.MeasureSpec.makeMeasureSpec(500, android.view.View.MeasureSpec.EXACTLY)
        root.measure(spec, hspec)
        root.layout(0, 0, 822, 500)
        val bmp = Bitmap.createBitmap(822, 500, Bitmap.Config.ARGB_8888)
        root.draw(android.graphics.Canvas(bmp))
        val dir = File(System.getProperty("screenshots.dir") ?: "build/screenshots").apply { mkdirs() }
        File(dir, "widget.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
