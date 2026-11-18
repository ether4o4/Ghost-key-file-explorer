package com.ghostkey.explorer.files

import android.os.Environment
import com.ghostkey.explorer.data.AppFolders
import com.ghostkey.explorer.data.DesktopLayout
import com.ghostkey.explorer.data.FolderPrefs
import com.ghostkey.explorer.intel.FileIndex
import com.ghostkey.explorer.intel.Timeline
import java.io.File

// Every file operation in the app goes through here, so moves and renames
// carry tags, SKUs, folder colors, desktop positions and home-screen
// shortcuts along with the file, and everything lands on the timeline.
object FileOps {
    fun desktopDir(): File = File(Environment.getExternalStorageDirectory(), "Desktop").apply { mkdirs() }

    /** Result of a batch transfer: how many worked, and the first error. */
    data class Outcome(val done: Int, val failed: Int, val error: String?) {
        val message: String get() = when {
            failed == 0 -> ""
            else -> error ?: "$failed item(s) failed"
        }
    }

    private fun isAncestorOrSame(ancestor: File, child: File): Boolean {
        val a = ancestor.canonicalPath
        val c = child.canonicalPath
        return c == a || c.startsWith(a + File.separator)
    }

    private fun repointEverything(old: File, new: File) {
        FileIndex.repoint(old.absolutePath, new.absolutePath)
        FolderPrefs.repoint(old.absolutePath, new.absolutePath)
        AppFolders.repointPath(old.absolutePath, new.absolutePath)
        DesktopLayout.rename("path:${old.absolutePath}", "path:${new.absolutePath}")
    }

    /** Move or copy [sources] into [destDir]. Never overwrites: clashes get " (n)". */
    fun transfer(sources: List<File>, destDir: File, copy: Boolean): Outcome {
        var done = 0
        var failed = 0
        var error: String? = null
        if (!destDir.isDirectory) return Outcome(0, sources.size, "Destination is not a folder")
        for (src in sources) {
            val result = runCatching {
                require(src.exists()) { "\"${src.name}\" no longer exists" }
                if (src.isDirectory) require(!isAncestorOrSame(src, destDir)) { "Can't put \"${src.name}\" inside itself" }
                if (!copy && src.parentFile?.canonicalPath == destDir.canonicalPath) return@runCatching false
                val target = Trash.uniqueName(destDir, src.name)
                if (copy) {
                    require(src.copyRecursively(target, overwrite = false)) { "Copy of \"${src.name}\" failed" }
                    Timeline.record("file_copied", "Copied \"${src.name}\" to ${destDir.name}", target.absolutePath)
                } else {
                    val moved = src.renameTo(target) || run {
                        // Different volume (e.g. SD card): copy, verify, then remove
                        val copied = src.copyRecursively(target, overwrite = false)
                        copied && sizeOf(target) == sizeOf(src) && src.deleteRecursively()
                    }
                    require(moved) { "Move of \"${src.name}\" failed" }
                    repointEverything(src, target)
                    Timeline.record("file_moved", "Moved \"${src.name}\" to ${destDir.name}", target.absolutePath)
                }
                true
            }
            result.onSuccess { if (it) done++ }.onFailure { failed++; if (error == null) error = it.message }
        }
        return Outcome(done, failed, error)
    }

    fun sizeOf(f: File): Long = if (f.isDirectory) f.walkTopDown().filter { it.isFile }.sumOf { it.length() } else f.length()

    fun rename(file: File, rawName: String): Result<File> = runCatching {
        val name = rawName.trim()
        require(name.isNotEmpty() && !name.contains('/') && name != "." && name != "..") { "Invalid name" }
        if (name == file.name) return@runCatching file
        val dest = File(file.parentFile, name)
        require(!dest.exists()) { "\"$name\" already exists" }
        require(file.renameTo(dest)) { "Rename failed" }
        repointEverything(file, dest)
        Timeline.record("file_renamed", "Renamed \"${file.name}\" to \"$name\"", dest.absolutePath)
        dest
    }

    fun newFolder(parent: File, name: String = "New folder"): Result<File> = runCatching {
        val dir = Trash.uniqueName(parent, name.trim().ifEmpty { "New folder" })
        require(dir.mkdirs()) { "Can't create a folder here" }
        Timeline.record("folder_created", "Created folder \"${dir.name}\"", dir.absolutePath)
        dir
    }

    fun newTextFile(parent: File): Result<File> = runCatching {
        val f = Trash.uniqueName(parent, "New Text Document.txt")
        require(f.createNewFile()) { "Can't create a file here" }
        f
    }

    fun delete(files: List<File>): Outcome {
        var done = 0
        var failed = 0
        files.forEach { f ->
            if (Trash.moveToTrash(f)) {
                done++
                DesktopLayout.remove("path:${f.absolutePath}")
                Timeline.record("file_deleted", "Moved \"${f.name}\" to the Recycle Bin", f.absolutePath)
            } else failed++
        }
        return Outcome(done, failed, if (failed > 0) "$failed item(s) couldn't be deleted" else null)
    }

    /** Bounded, on-demand recursive name search (no index, no background scan). */
    fun search(root: File, query: String, limit: Int = 300, showHidden: Boolean = false): List<File> {
        val q = query.trim().lowercase()
        if (q.isEmpty()) return emptyList()
        val out = mutableListOf<File>()
        root.walkTopDown()
            .onEnter { showHidden || !it.name.startsWith(".") || it == root }
            .maxDepth(12)
            .forEach { f ->
                if (out.size >= limit) return out
                if (f != root && f.name.lowercase().contains(q)) out += f
            }
        return out
    }
}
