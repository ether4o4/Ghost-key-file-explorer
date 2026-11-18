package com.ghostkey.explorer.data

import android.content.Context
import androidx.compose.runtime.mutableStateListOf
import com.ghostkey.explorer.intel.Timeline
import com.ghostkey.explorer.widget.WidgetBindings
import org.json.JSONArray
import org.json.JSONObject

// One thing inside an app folder: an installed app, or a shortcut to a file
// or folder on storage. App folders are what the home-screen widgets show.
data class FolderItem(
    val kind: String, // "app" | "file"
    val value: String, // package name, or absolute path
    val label: String,
) {
    val key: String get() = "$kind:$value"
}

data class AppFolder(
    val id: String,
    val name: String,
    val color: Long = 0xFFFFCA28,
    val items: List<FolderItem> = emptyList(),
)

// Persistent, observable list of app folders. Every change refreshes the
// home-screen widgets bound to the folder.
object AppFolders {
    private const val FILE = "app_folders.json"
    private lateinit var appContext: Context

    val folders = mutableStateListOf<AppFolder>()

    val COLORS = listOf(
        0xFFFFCA28, 0xFF4CC2FF, 0xFF6C63FF, 0xFF00D4FF,
        0xFF00C853, 0xFFFF6B35, 0xFFFF3355, 0xFFE2E8F0,
    )

    fun init(context: Context) {
        appContext = context.applicationContext
        folders.clear()
        folders += load()
    }

    /** Reload from disk (the widget process reads the same file). */
    fun load(): List<AppFolder> = runCatching {
        val arr = JSONArray(JsonStore.read(FILE) ?: "[]")
        List(arr.length()) { fromJson(arr.getJSONObject(it)) }
    }.getOrDefault(emptyList())

    fun get(id: String): AppFolder? = folders.firstOrNull { it.id == id } ?: load().firstOrNull { it.id == id }

    fun create(name: String, color: Long = COLORS[folders.size % COLORS.size]): AppFolder {
        val f = AppFolder(id = "af_" + java.util.UUID.randomUUID().toString().replace("-", "").take(16), name = uniqueName(name), color = color)
        folders += f
        save()
        Timeline.record("folder_created", "App folder \"${f.name}\" created")
        return f
    }

    private fun uniqueName(base: String): String {
        val clean = base.trim().ifEmpty { "New folder" }
        if (folders.none { it.name.equals(clean, ignoreCase = true) }) return clean
        var n = 2
        while (folders.any { it.name.equals("$clean ($n)", ignoreCase = true) }) n++
        return "$clean ($n)"
    }

    fun rename(id: String, name: String) = update(id) { it.copy(name = name.trim().ifEmpty { it.name }) }

    fun setColor(id: String, color: Long) = update(id) { it.copy(color = color) }

    fun delete(id: String) {
        val f = folders.firstOrNull { it.id == id } ?: return
        folders.removeAll { it.id == id }
        save()
        Timeline.record("folder_deleted", "App folder \"${f.name}\" deleted")
    }

    fun addItems(id: String, newItems: List<FolderItem>) = update(id) { folder ->
        val existing = folder.items.map { it.key }.toSet()
        folder.copy(items = folder.items + newItems.filter { it.key !in existing }.distinctBy { it.key })
    }

    fun removeItem(id: String, item: FolderItem) = update(id) { folder ->
        folder.copy(items = folder.items.filterNot { it.key == item.key })
    }

    /** Move an item from one folder to another (drag between folders). */
    fun moveItem(fromId: String, toId: String, item: FolderItem) {
        if (fromId == toId) return
        removeItem(fromId, item)
        addItems(toId, listOf(item))
    }

    /** Reorder inside a folder: put [item] at [index]. */
    fun reorder(id: String, item: FolderItem, index: Int) = update(id) { folder ->
        val list = folder.items.filterNot { it.key == item.key }.toMutableList()
        list.add(index.coerceIn(0, list.size), item)
        folder.copy(items = list)
    }

    /** Keep file shortcuts pointing at the right place after a move/rename. */
    fun repointPath(oldPath: String, newPath: String) {
        var changed = false
        for (i in folders.indices) {
            val f = folders[i]
            val items = f.items.map { item ->
                if (item.kind == "file" && (item.value == oldPath || item.value.startsWith("$oldPath/"))) {
                    changed = true
                    val updated = newPath + item.value.removePrefix(oldPath)
                    item.copy(value = updated, label = if (item.value == oldPath) java.io.File(updated).name else item.label)
                } else item
            }
            if (changed) folders[i] = f.copy(items = items)
        }
        if (changed) save()
    }

    private fun update(id: String, transform: (AppFolder) -> AppFolder) {
        val idx = folders.indexOfFirst { it.id == id }
        if (idx < 0) return
        folders[idx] = transform(folders[idx])
        save()
    }

    private fun save() {
        val arr = JSONArray()
        folders.forEach { arr.put(toJson(it)) }
        JsonStore.write(FILE, arr.toString())
        if (::appContext.isInitialized) WidgetBindings.refreshAll(appContext)
    }

    private fun toJson(f: AppFolder) = JSONObject()
        .put("id", f.id).put("name", f.name).put("color", f.color)
        .put(
            "items",
            JSONArray().apply {
                f.items.forEach { put(JSONObject().put("kind", it.kind).put("value", it.value).put("label", it.label)) }
            },
        )

    private fun fromJson(o: JSONObject): AppFolder {
        val items = o.optJSONArray("items") ?: JSONArray()
        return AppFolder(
            id = o.getString("id"),
            name = o.optString("name", "Folder"),
            color = o.optLong("color", 0xFFFFCA28),
            items = List(items.length()) {
                val it2 = items.getJSONObject(it)
                FolderItem(it2.getString("kind"), it2.getString("value"), it2.optString("label"))
            },
        )
    }
}
