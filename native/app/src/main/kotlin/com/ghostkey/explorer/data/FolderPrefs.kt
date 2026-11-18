package com.ghostkey.explorer.data

import androidx.compose.runtime.mutableStateMapOf
import org.json.JSONObject

// Ghost Key's per-folder customization (color + icon), stored locally —
// no marker files are ever written into your folders.
data class FolderPref(val color: Long? = null, val icon: String? = null)

object FolderPrefs {
    private const val FILE = "folder_prefs.json"
    val prefs = mutableStateMapOf<String, FolderPref>()

    val ICONS = listOf("folder", "star", "work", "photo", "music", "video", "code", "archive", "lock", "home")

    fun init() {
        prefs.clear()
        runCatching {
            val o = JSONObject(JsonStore.read(FILE) ?: "{}")
            o.keys().forEach { k ->
                val p = o.getJSONObject(k)
                prefs[k] = FolderPref(
                    color = if (p.has("color")) p.getLong("color") else null,
                    icon = p.optString("icon").ifEmpty { null },
                )
            }
        }
    }

    fun set(path: String, pref: FolderPref) {
        if (pref.color == null && pref.icon == null) prefs.remove(path) else prefs[path] = pref
        save()
    }

    /** Carry customization along when a folder is moved or renamed. */
    fun repoint(oldPath: String, newPath: String) {
        val moved = prefs.keys.filter { it == oldPath || it.startsWith("$oldPath/") }
        if (moved.isEmpty()) return
        moved.forEach { k -> prefs.remove(k)?.let { prefs[newPath + k.removePrefix(oldPath)] = it } }
        save()
    }

    private fun save() {
        val o = JSONObject()
        prefs.forEach { (k, v) ->
            o.put(k, JSONObject().apply { v.color?.let { put("color", it) }; v.icon?.let { put("icon", it) } })
        }
        JsonStore.write(FILE, o.toString())
    }
}
