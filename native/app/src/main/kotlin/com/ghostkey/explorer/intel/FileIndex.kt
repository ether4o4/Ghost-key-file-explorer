package com.ghostkey.explorer.intel

import androidx.compose.runtime.mutableStateMapOf
import com.ghostkey.explorer.data.JsonStore
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.random.Random

// Ghost Key's file intelligence index. A file only enters it when you inspect,
// tag or link it (no background scanning). Each indexed file gets a SKU
// (GK-YYYY-MM-XXXX), who/what/when/where tags and SKU links ("magnetism").
data class FileRecord(
    val path: String,
    val sku: String,
    val tags: List<Tag> = emptyList(),
    val links: List<String> = emptyList(), // linked SKUs
    val flagged: Boolean = false,
    val pinned: Boolean = false,
    val analysis: AnalysisResult? = null,
    val indexedAt: Long = System.currentTimeMillis(),
)

object FileIndex {
    private const val FILE = "file_index.json"
    val records = mutableStateMapOf<String, FileRecord>() // by absolute path

    fun init() {
        records.clear()
        runCatching {
            val arr = JSONArray(JsonStore.read(FILE) ?: "[]")
            for (i in 0 until arr.length()) fromJson(arr.getJSONObject(i)).let { records[it.path] = it }
        }
    }

    fun get(path: String): FileRecord? = records[path]

    fun bySku(sku: String): FileRecord? = records.values.firstOrNull { it.sku == sku }

    fun newSku(date: Date = Date()): String {
        val prefix = "GK-" + SimpleDateFormat("yyyy-MM", Locale.ROOT).format(date) + "-"
        var sku: String
        do { sku = prefix + (1000 + Random.nextInt(9000)) } while (records.values.any { it.sku == sku })
        return sku
    }

    /** Index a file (auto-tagging it) or return its existing record. */
    fun ensure(file: File): FileRecord {
        records[file.absolutePath]?.let { return it }
        val content = Tagger.readTextSample(file)
        val rec = FileRecord(
            path = file.absolutePath,
            sku = newSku(Date(file.lastModified())),
            tags = Tagger.autoTag(file, content),
        )
        records[rec.path] = rec
        save()
        Timeline.record("file_tagged", "Auto-tagged \"${file.name}\" (${rec.sku})", rec.path, rec.sku)
        return rec
    }

    fun update(path: String, transform: (FileRecord) -> FileRecord) {
        val r = records[path] ?: return
        records[path] = transform(r)
        save()
    }

    fun addTag(path: String, tag: Tag) = update(path) { r ->
        if (r.tags.any { it.dimension == tag.dimension && it.value.equals(tag.value, true) }) r
        else r.copy(tags = r.tags + tag)
    }.also { Timeline.record("file_tagged", "Tagged ${File(path).name} ${tag.dimension}: ${tag.value}", path) }

    fun removeTag(path: String, tag: Tag) = update(path) { r -> r.copy(tags = r.tags - tag) }

    fun link(skuA: String, skuB: String) {
        if (skuA == skuB) return
        val a = bySku(skuA) ?: return
        val b = bySku(skuB) ?: return
        if (skuB !in a.links) records[a.path] = a.copy(links = a.links + skuB)
        if (skuA !in b.links) records[b.path] = b.copy(links = b.links + skuA)
        save()
        Timeline.record("sku_linked", "Linked $skuA ↔ $skuB", a.path, skuA)
    }

    fun unlink(skuA: String, skuB: String) {
        bySku(skuA)?.let { records[it.path] = it.copy(links = it.links - skuB) }
        bySku(skuB)?.let { records[it.path] = it.copy(links = it.links - skuA) }
        save()
    }

    /** All SKUs reachable through links (the file's cluster). */
    fun cluster(sku: String): List<FileRecord> {
        val seen = LinkedHashSet<String>()
        val queue = ArrayDeque(listOf(sku))
        while (queue.isNotEmpty()) {
            val s = queue.removeFirst()
            if (!seen.add(s)) continue
            bySku(s)?.links?.forEach { queue += it }
        }
        return seen.mapNotNull { bySku(it) }
    }

    /** Magnetism: auto-link indexed files that share a who or where tag. */
    fun magnetize(path: String): Int {
        val r = records[path] ?: return 0
        val who = r.tags.filter { it.dimension == "who" }.map { it.value.lowercase() }.toSet()
        val where = r.tags.filter { it.dimension == "where" && it.confidence >= 1.0 }.map { it.value.lowercase() }.toSet()
        if (who.isEmpty() && where.isEmpty()) return 0
        var n = 0
        records.values.toList().filter { it.path != path }.forEach { c ->
            val cw = c.tags.filter { it.dimension == "who" }.map { it.value.lowercase() }
            val cwh = c.tags.filter { it.dimension == "where" }.map { it.value.lowercase() }
            if ((cw.any { it in who } || cwh.any { it in where }) && c.sku !in r.links) {
                link(r.sku, c.sku)
                n++
            }
        }
        return n
    }

    /** Keep records attached to files after a move or rename. */
    fun repoint(oldPath: String, newPath: String) {
        val moved = records.keys.filter { it == oldPath || it.startsWith("$oldPath/") }
        if (moved.isEmpty()) return
        moved.forEach { k ->
            records.remove(k)?.let { val np = newPath + k.removePrefix(oldPath); records[np] = it.copy(path = np) }
        }
        save()
    }

    fun forget(path: String) {
        if (records.remove(path) != null) save()
    }

    /** Tag search, e.g. "who:alice", "where=snapchat", "GK-2026-05", or free text. */
    fun search(query: String): List<FileRecord> {
        val q = query.trim()
        if (q.isEmpty()) return emptyList()
        val m = Regex("""^(who|what|when|where)\s*[:=]\s*(.+)$""", RegexOption.IGNORE_CASE).find(q)
        return records.values.filter { r ->
            if (m != null) {
                val dim = m.groupValues[1].lowercase()
                val v = m.groupValues[2].trim()
                r.tags.any { it.dimension == dim && it.value.contains(v, true) }
            } else {
                r.sku.contains(q, true) || r.tags.any { it.value.contains(q, true) } ||
                    File(r.path).name.contains(q, true)
            }
        }.sortedBy { File(it.path).name.lowercase() }
    }

    private fun save() {
        val arr = JSONArray()
        records.values.forEach { arr.put(toJson(it)) }
        JsonStore.write(FILE, arr.toString())
    }

    private fun toJson(r: FileRecord): JSONObject = JSONObject()
        .put("path", r.path).put("sku", r.sku).put("flagged", r.flagged).put("pinned", r.pinned)
        .put("indexedAt", r.indexedAt)
        .put("links", JSONArray(r.links))
        .put("tags", JSONArray().apply { r.tags.forEach { put(JSONObject().put("d", it.dimension).put("v", it.value).put("c", it.confidence)) } })
        .apply { r.analysis?.let { put("analysis", Analyzer.toJson(it)) } }

    private fun fromJson(o: JSONObject): FileRecord {
        val tags = o.optJSONArray("tags") ?: JSONArray()
        val links = o.optJSONArray("links") ?: JSONArray()
        return FileRecord(
            path = o.getString("path"),
            sku = o.getString("sku"),
            tags = List(tags.length()) { tags.getJSONObject(it).let { t -> Tag(t.getString("d"), t.getString("v"), t.optDouble("c", 1.0)) } },
            links = List(links.length()) { links.getString(it) },
            flagged = o.optBoolean("flagged"),
            pinned = o.optBoolean("pinned"),
            analysis = o.optJSONObject("analysis")?.let { Analyzer.fromJson(it) },
            indexedAt = o.optLong("indexedAt", System.currentTimeMillis()),
        )
    }
}
