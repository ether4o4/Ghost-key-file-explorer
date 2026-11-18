package com.ghostkey.explorer.intel

import androidx.compose.runtime.mutableStateListOf
import com.ghostkey.explorer.data.JsonStore
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

// Ghost Key's global timeline: every action is recorded as an event, grouped
// by day with activity-spike detection. Kept on-device, capped in size.
data class TimelineEvent(
    val type: String,
    val description: String,
    val path: String? = null,
    val sku: String? = null,
    val timestamp: Long = System.currentTimeMillis(),
)

object Timeline {
    private const val FILE = "timeline.json"
    private const val MAX_EVENTS = 5000
    private val io = Executors.newSingleThreadExecutor()

    val events = mutableStateListOf<TimelineEvent>() // newest first

    // Filter groups shown as chips in the Timeline window
    val GROUPS: Map<String, Set<String>> = linkedMapOf(
        "All" to emptySet(),
        "Files" to setOf("file_opened", "file_moved", "file_copied", "file_renamed", "file_deleted", "file_restored", "file_imported", "folder_created"),
        "Tags" to setOf("file_tagged", "file_analyzed", "sku_linked"),
        "Vaults" to setOf("vault_created", "vault_locked", "vault_unlocked", "vault_added", "vault_extracted", "vault_wiped"),
        "Limbo" to setOf("limbo_opened", "limbo_analyzed", "limbo_placed", "limbo_discarded"),
        "Home" to setOf("widget_pinned", "folder_deleted", "folder_created"),
        "Search" to setOf("search_performed"),
    )

    fun init() {
        events.clear()
        runCatching {
            val arr = JSONArray(JsonStore.read(FILE) ?: "[]")
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                events += TimelineEvent(
                    type = o.getString("type"),
                    description = o.getString("desc"),
                    path = o.optString("path").ifEmpty { null },
                    sku = o.optString("sku").ifEmpty { null },
                    timestamp = o.getLong("ts"),
                )
            }
        }
    }

    fun record(type: String, description: String, path: String? = null, sku: String? = null) {
        val ev = TimelineEvent(type, description, path, sku)
        val apply = {
            events.add(0, ev)
            while (events.size > MAX_EVENTS) events.removeAt(events.lastIndex)
        }
        // Snapshot state must be mutated on the main thread
        val main = android.os.Looper.getMainLooper()
        if (android.os.Looper.myLooper() == main) apply() else android.os.Handler(main).post { apply() }
        persistSoon()
    }

    fun clear() {
        events.clear()
        persistSoon()
    }

    private fun persistSoon() {
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            val snapshot = events.toList()
            io.execute {
                val arr = JSONArray()
                snapshot.forEach {
                    arr.put(
                        JSONObject().put("type", it.type).put("desc", it.description)
                            .put("path", it.path ?: "").put("sku", it.sku ?: "").put("ts", it.timestamp),
                    )
                }
                JsonStore.write(FILE, arr.toString())
            }
        }
    }

    fun dayKey(ts: Long): String = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(Date(ts))

    /** Days whose event count is well above the typical day: activity spikes. */
    fun spikeDays(list: List<TimelineEvent>): Set<String> {
        val perDay = list.groupingBy { dayKey(it.timestamp) }.eachCount()
        if (perDay.size < 2) return perDay.filterValues { it >= 10 }.keys
        val avg = perDay.values.average()
        val threshold = maxOf(5.0, avg * 2)
        return perDay.filterValues { it >= threshold }.keys
    }

    fun relativeTime(ts: Long): String {
        val secs = (System.currentTimeMillis() - ts) / 1000
        val mins = secs / 60
        val hours = mins / 60
        val days = hours / 24
        return when {
            days > 0 -> "${days}d ago"
            hours > 0 -> "${hours}h ago"
            mins > 0 -> "${mins}m ago"
            else -> "just now"
        }
    }

    fun color(type: String): Long = when {
        type.startsWith("vault") -> 0xFFFF3355
        type.startsWith("limbo") -> 0xFFFF6B35
        type == "file_tagged" || type == "file_restored" -> 0xFF00C853
        type == "file_analyzed" -> 0xFFFFD700
        type == "sku_linked" -> 0xFFFF6B35
        type == "file_deleted" -> 0xFFFF5F57
        type == "widget_pinned" || type.startsWith("folder") -> 0xFF4CC2FF
        else -> 0xFF6C63FF
    }
}
