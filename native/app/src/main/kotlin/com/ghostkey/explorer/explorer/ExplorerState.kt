package com.ghostkey.explorer.explorer

import android.content.Context
import android.os.Build
import android.os.Environment
import android.os.StatFs
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.InsertDriveFile
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.outlined.Android
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.AudioFile
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.FolderZip
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material.icons.outlined.Photo
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.VideoFile
import androidx.compose.material.icons.outlined.VideoLibrary
import androidx.compose.material.icons.outlined.Work
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.vector.ImageVector
import com.ghostkey.explorer.files.Trash
import java.io.File
import java.util.Locale

enum class ViewMode { LIST, GRID }
enum class SortKey(val label: String) { NAME("Name"), MODIFIED("Date modified"), SIZE("Size"), TYPE("Type") }

// Shared clipboard, like Windows: cut in one window, paste in another.
object ExplorerClipboard {
    var files by mutableStateOf<List<File>>(emptyList())
        private set
    var isCut by mutableStateOf(false)
        private set

    fun set(list: List<File>, cut: Boolean) { files = list; isCut = cut }
    fun clear() { files = emptyList(); isCut = false }
}

// One explorer pane: location, history, selection, view and sort.
class PaneState(initial: File) {
    var currentDir by mutableStateOf(initial)
        private set
    private val back = ArrayDeque<File>()
    private val forward = ArrayDeque<File>()
    var canGoBack by mutableStateOf(false)
        private set
    var canGoForward by mutableStateOf(false)
        private set
    var refreshTick by mutableIntStateOf(0)
    var selection by mutableStateOf<Set<String>>(emptySet())
    var view by mutableStateOf(ViewMode.LIST)
    var sortKey by mutableStateOf(SortKey.NAME)
    var sortAsc by mutableStateOf(true)
    var searching by mutableStateOf(false)
    var query by mutableStateOf("")

    val inTrash: Boolean get() = Trash.isTrash(currentDir)

    fun navigate(dir: File) {
        if (dir.absolutePath == currentDir.absolutePath) return
        back.addLast(currentDir)
        forward.clear()
        currentDir = dir
        selection = emptySet()
        searching = false
        query = ""
        sync()
    }

    fun goBack() {
        back.removeLastOrNull()?.let { forward.addLast(currentDir); currentDir = it; selection = emptySet() }
        sync()
    }

    fun goForward() {
        forward.removeLastOrNull()?.let { back.addLast(currentDir); currentDir = it; selection = emptySet() }
        sync()
    }

    private fun sync() { canGoBack = back.isNotEmpty(); canGoForward = forward.isNotEmpty() }

    fun refresh() { refreshTick++ }

    fun toggle(path: String) {
        selection = if (path in selection) selection - path else selection + path
    }

    fun setSort(key: SortKey) {
        if (sortKey == key) sortAsc = !sortAsc else { sortKey = key; sortAsc = true }
    }
}

fun sortFiles(files: List<File>, key: SortKey, asc: Boolean): List<File> {
    val cmp: Comparator<File> = when (key) {
        SortKey.NAME -> compareBy { it.name.lowercase(Locale.ROOT) }
        SortKey.MODIFIED -> compareBy { it.lastModified() }
        SortKey.SIZE -> compareBy { if (it.isDirectory) -1L else it.length() }
        SortKey.TYPE -> compareBy<File> { it.extension.lowercase(Locale.ROOT) }.thenBy { it.name.lowercase(Locale.ROOT) }
    }
    val ordered = files.sortedWith(if (asc) cmp else cmp.reversed())
    // Folders always first, like Explorer
    return ordered.filter { it.isDirectory } + ordered.filterNot { it.isDirectory }
}

// Storage volumes for "This PC": internal storage plus any SD card / USB
// drive, resolved through StorageManager (listing /storage directly is
// blocked by Android regardless of permissions).
fun storageVolumeDirs(context: Context): List<File> = runCatching {
    val sm = context.getSystemService(Context.STORAGE_SERVICE) as android.os.storage.StorageManager
    val vols = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) sm.storageVolumes.mapNotNull { it.directory } else emptyList()
    vols.ifEmpty { listOf(Environment.getExternalStorageDirectory()) }
}.getOrDefault(listOf(Environment.getExternalStorageDirectory()))

fun volumeDisplayName(file: File): String? = when {
    file.absolutePath == Environment.getExternalStorageDirectory().absolutePath -> "Internal storage"
    file.parentFile?.absolutePath == "/storage" && file.name != "emulated" && file.name != "self" -> "SD card (${file.name})"
    else -> null
}

// Breadcrumb segments: label + navigable dir (null = not navigable)
fun breadcrumbsFor(currentDir: File, home: File, limboRoot: File?): List<Pair<String, File?>> {
    val homePath = home.absolutePath
    val path = currentDir.absolutePath
    return when {
        Trash.isTrash(currentDir) -> listOf("Recycle Bin" to null)
        limboRoot != null && path.startsWith(limboRoot.absolutePath) -> {
            val crumbs = mutableListOf<Pair<String, File?>>("Limbo" to limboRoot)
            path.removePrefix(limboRoot.absolutePath).trim('/').takeIf { it.isNotEmpty() }?.let { rest ->
                var acc = limboRoot
                rest.split('/').forEach { part -> acc = File(acc, part); crumbs += part to acc }
            }
            crumbs
        }
        path.startsWith(homePath) -> {
            val crumbs = mutableListOf<Pair<String, File?>>("Home" to home)
            val rest = path.removePrefix(homePath).trim('/')
            if (rest.isNotEmpty()) {
                var acc = home
                rest.split('/').forEach { part -> acc = File(acc, part); crumbs += part to acc }
            }
            crumbs
        }
        else -> {
            val crumbs = mutableListOf<Pair<String, File?>>("This PC" to File("/storage"))
            val rest = path.removePrefix("/storage").trim('/')
            if (path.startsWith("/storage") && rest.isNotEmpty()) {
                var acc = File("/storage")
                rest.split('/').forEach { part -> acc = File(acc, part); crumbs += part to acc }
            } else if (path != "/storage") {
                crumbs += path to currentDir
            }
            crumbs
        }
    }
}

fun fileIcon(name: String): ImageVector {
    return when (name.substringAfterLast('.', "").lowercase(Locale.ROOT)) {
        "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic" -> Icons.Outlined.Image
        "mp4", "mkv", "webm", "avi", "mov" -> Icons.Outlined.VideoFile
        "mp3", "wav", "ogg", "flac", "m4a" -> Icons.Outlined.AudioFile
        "pdf" -> Icons.Outlined.PictureAsPdf
        "zip", "rar", "7z", "tar", "gz" -> Icons.Outlined.FolderZip
        "apk" -> Icons.Outlined.Android
        "txt", "md", "log", "json", "xml" -> Icons.Outlined.Description
        else -> Icons.AutoMirrored.Outlined.InsertDriveFile
    }
}

/** Icon for a customized folder (Ghost Key folder preferences). */
fun folderIcon(name: String?): ImageVector = when (name) {
    "star" -> Icons.Outlined.Star
    "work" -> Icons.Outlined.Work
    "photo" -> Icons.Outlined.Photo
    "music" -> Icons.Outlined.MusicNote
    "video" -> Icons.Outlined.VideoLibrary
    "code" -> Icons.Outlined.Code
    "archive" -> Icons.Outlined.Archive
    "lock" -> Icons.Outlined.Lock
    "home" -> Icons.Outlined.Home
    else -> Icons.Filled.Folder
}

fun formatSize(bytes: Long): String = when {
    bytes >= 1_073_741_824 -> String.format(Locale.ROOT, "%.1f GB", bytes / 1_073_741_824.0)
    bytes >= 1_048_576 -> String.format(Locale.ROOT, "%.1f MB", bytes / 1_048_576.0)
    bytes >= 1_024 -> String.format(Locale.ROOT, "%.1f KB", bytes / 1_024.0)
    else -> "$bytes B"
}

fun freeSpaceText(dir: File): String? = runCatching {
    val st = StatFs(dir.absolutePath)
    if (st.totalBytes <= 0) null else "${formatSize(st.availableBytes)} free of ${formatSize(st.totalBytes)}"
}.getOrNull()

fun isImage(f: File) = f.extension.lowercase(Locale.ROOT) in setOf("jpg", "jpeg", "png", "gif", "webp", "bmp", "heic")
