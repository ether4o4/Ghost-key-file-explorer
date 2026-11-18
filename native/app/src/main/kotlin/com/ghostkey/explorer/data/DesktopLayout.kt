package com.ghostkey.explorer.data

import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.geometry.Offset
import org.json.JSONArray
import org.json.JSONObject

// Where each desktop icon sits (grid-snapped, in px) — keyed by a stable
// id: "builtin:files", "folder:<appFolderId>", "path:<absolute path>".
object DesktopLayout {
    private const val FILE = "desktop_layout.json"
    val positions = mutableStateMapOf<String, Offset>()

    fun init() {
        positions.clear()
        runCatching {
            val o = JSONObject(JsonStore.read(FILE) ?: "{}")
            o.keys().forEach { k ->
                val a = o.getJSONArray(k)
                positions[k] = Offset(a.getDouble(0).toFloat(), a.getDouble(1).toFloat())
            }
        }
    }

    fun set(key: String, pos: Offset) {
        positions[key] = pos
    }

    fun rename(oldKey: String, newKey: String) {
        positions.remove(oldKey)?.let { positions[newKey] = it }
        save()
    }

    fun remove(key: String) {
        positions.remove(key)
        save()
    }

    fun save() {
        val o = JSONObject()
        positions.forEach { (k, v) -> o.put(k, JSONArray().put(v.x.toDouble()).put(v.y.toDouble())) }
        JsonStore.write(FILE, o.toString())
    }
}
