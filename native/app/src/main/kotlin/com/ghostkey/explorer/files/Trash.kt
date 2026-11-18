package com.ghostkey.explorer.files

import android.os.Environment
import org.json.JSONObject
import java.io.File

// The launcher's Recycle Bin. Two sources, like Windows aggregates drives:
//  1. Files deleted through the shell — moved into .ghostkey_trash with the
//     original path recorded so Restore puts them back.
//  2. Android system trash — when apps (galleries, Photos, file managers)
//     delete media via MediaStore, Android renames the file in place to
//     ".trashed-<expiry>-<name>". With all-files access we surface those too.
// Cloud-only trash (e.g. a cloud service's server-side bin) has no local file
// and cannot appear here.
object Trash {
    private const val INDEX = ".index.json"

    data class TrashEntry(
        val file: File,
        val displayName: String,
        val originalPath: String?,
        val isSystemTrash: Boolean,
    )

    fun dir(): File =
        File(Environment.getExternalStorageDirectory(), ".ghostkey_trash").apply { mkdirs() }

    fun isTrash(path: File): Boolean = path.absolutePath == dir().absolutePath

    private fun indexFile() = File(dir(), INDEX)

    private fun readIndex(): JSONObject =
        runCatching { JSONObject(indexFile().readText()) }.getOrDefault(JSONObject())

    private fun writeIndex(index: JSONObject) {
        runCatching { indexFile().writeText(index.toString()) }
    }

    // Move a file into the bin, remembering where it came from
    fun moveToTrash(file: File): Boolean {
        val target = uniqueName(dir(), file.name)
        val ok = runCatching { file.renameTo(target) }.getOrDefault(false)
        if (ok) {
            val index = readIndex()
            index.put(target.name, file.absolutePath)
            writeIndex(index)
        }
        return ok
    }

    fun listEntries(): List<TrashEntry> {
        val index = readIndex()
        val own = dir().listFiles().orEmpty()
            .filter { it.name != INDEX }
            .map { file ->
                TrashEntry(
                    file = file,
                    displayName = file.name,
                    originalPath = index.optString(file.name).takeIf { it.isNotEmpty() },
                    isSystemTrash = false,
                )
            }
        return (own + scanSystemTrash()).sortedByDescending { it.file.lastModified() }
    }

    private fun scanSystemTrash(): List<TrashEntry> {
        val out = mutableListOf<TrashEntry>()
        listOf("DCIM", "Pictures", "Download", "Documents", "Movies", "Music", "Recordings")
            .map { File(Environment.getExternalStorageDirectory(), it) }
            .forEach { root -> walk(root, depth = 0, out = out) }
        return out
    }

    private fun walk(dir: File, depth: Int, out: MutableList<TrashEntry>) {
        if (depth > 3 || out.size >= 500) return
        val children = dir.listFiles() ?: return
        for (child in children) {
            if (child.name.startsWith(".trashed-")) {
                // ".trashed-<expiryEpoch>-<originalName>"
                val original = child.name.removePrefix(".trashed-").substringAfter('-', "")
                    .ifEmpty { child.name }
                out += TrashEntry(
                    file = child,
                    displayName = original,
                    originalPath = File(child.parentFile, original).absolutePath,
                    isSystemTrash = true,
                )
            } else if (child.isDirectory && !child.name.startsWith(".")) {
                walk(child, depth + 1, out)
            }
        }
    }

    fun restore(entry: TrashEntry): Boolean {
        val fallback = File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            entry.displayName,
        ).absolutePath
        val wanted = File(entry.originalPath ?: fallback)
        val parent = wanted.parentFile ?: return false
        parent.mkdirs()
        val dest = uniqueName(parent, wanted.name)
        val ok = runCatching { entry.file.renameTo(dest) }.getOrDefault(false)
        if (ok && !entry.isSystemTrash) {
            val index = readIndex()
            index.remove(entry.file.name)
            writeIndex(index)
        }
        return ok
    }

    fun deletePermanently(entry: TrashEntry): Boolean {
        val ok = entry.file.deleteRecursively()
        if (ok && !entry.isSystemTrash) {
            val index = readIndex()
            index.remove(entry.file.name)
            writeIndex(index)
        }
        return ok
    }

    fun empty() {
        listEntries().forEach { deletePermanently(it) }
    }

    fun uniqueName(parent: File, name: String): File {
        var candidate = File(parent, name)
        var counter = 1
        val base = name.substringBeforeLast('.', name)
        val ext = name.substringAfterLast('.', "")
        while (candidate.exists()) {
            val suffixed = if (ext.isEmpty() || base == name) "$name ($counter)"
            else "$base ($counter).$ext"
            candidate = File(parent, suffixed)
            counter++
        }
        return candidate
    }
}
