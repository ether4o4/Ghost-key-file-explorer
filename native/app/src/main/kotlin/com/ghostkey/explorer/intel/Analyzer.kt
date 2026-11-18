package com.ghostkey.explorer.intel

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale

// Ghost Key analysis engine: entity extraction, risk score, platform and
// pattern detection, summary. Pure heuristics; runs fully on-device.
data class AnalysisResult(
    val summary: String,
    val names: List<String>,
    val phones: List<String>,
    val emails: List<String>,
    val urls: List<String>,
    val domains: List<String>,
    val dates: List<String>,
    val keywords: List<String>,
    val patterns: List<String>,
    val riskScore: Double,
    val analyzedAt: Long = System.currentTimeMillis(),
) {
    val riskLabel: String get() = when {
        riskScore >= 7 -> "HIGH"
        riskScore >= 4 -> "MEDIUM"
        else -> "LOW"
    }
    val riskColor: Long get() = when {
        riskScore >= 7 -> 0xFFFF3355
        riskScore >= 4 -> 0xFFFFD700
        else -> 0xFF00C853
    }
}

object Analyzer {
    private val RISK = listOf(
        "password", "passwd", "secret", "private key", "api_key", "token", "credential",
        "ssn", "social security", "credit card", "bank account", "routing number",
        "dob", "date of birth", "passport", "driver license",
    )
    private val PLATFORMS = mapOf(
        "Snapchat" to Regex("snapchat|\\.snap", RegexOption.IGNORE_CASE),
        "Instagram" to Regex("instagram|insta", RegexOption.IGNORE_CASE),
        "iCloud" to Regex("icloud", RegexOption.IGNORE_CASE),
        "WhatsApp" to Regex("whatsapp", RegexOption.IGNORE_CASE),
        "Telegram" to Regex("telegram", RegexOption.IGNORE_CASE),
        "Discord" to Regex("discord", RegexOption.IGNORE_CASE),
        "Facebook" to Regex("facebook|fb\\.", RegexOption.IGNORE_CASE),
        "TikTok" to Regex("tiktok", RegexOption.IGNORE_CASE),
    )

    fun keywords(content: String, limit: Int = 10): List<String> =
        content.lowercase(Locale.ROOT).replace(Regex("[^a-z0-9\\s]"), " ")
            .split(Regex("\\s+")).filter { it.length > 4 }
            .groupingBy { it }.eachCount().entries.sortedByDescending { it.value }
            .take(limit).map { it.key }

    fun analyze(file: File, tags: List<Tag>): AnalysisResult {
        val content = Tagger.readTextSample(file) ?: ""
        val ex = if (content.isNotEmpty()) Tagger.extract(content) else Extracted()
        val names = tags.filter { it.dimension == "who" }.map { it.value }
        val text = "${file.name} $content"
        val platforms = PLATFORMS.filter { it.value.containsMatchIn(text) }.keys.toList()
        val domains = (ex.domains + platforms).distinctBy { it.lowercase() }

        var risk = 0.0
        val lower = content.lowercase(Locale.ROOT)
        RISK.forEach { if (lower.contains(it)) risk += 1.5 }
        risk += ex.phones.size * 0.5 + ex.emails.size * 0.3
        risk = risk.coerceAtMost(10.0)

        val patterns = buildList {
            if (ex.phones.size > 2) add("Multiple phone numbers: possible contact list")
            if (ex.emails.size > 2) add("Multiple email addresses: possible data export")
            if (domains.size > 1) add("Multi-platform activity: ${domains.joinToString()}")
            if (ex.urls.size > 3) add("High URL density: possible web activity log")
            val n = (file.name + " " + lower).lowercase(Locale.ROOT)
            if (n.contains("backup") || n.contains(".bak")) add("Backup file detected")
            if (n.contains("export") || n.contains("dump")) add("Data export/dump detected")
            if (lower.contains("chat") || lower.contains("message") || lower.contains("conversation")) add("Communication content detected")
        }

        val what = tags.firstOrNull { it.dimension == "what" }?.value ?: "File"
        val whenV = tags.firstOrNull { it.dimension == "when" }?.value
        val whereV = tags.firstOrNull { it.dimension == "where" }?.value
        val summary = buildList {
            add("$what from ${whereV ?: "unknown source"}")
            whenV?.let { add("around $it") }
            if (names.isNotEmpty()) add("linked to ${names.joinToString()}")
            if (platforms.isNotEmpty()) add("referencing ${platforms.joinToString(" & ")}")
            if (ex.phones.isNotEmpty()) add("contains ${ex.phones.size} phone number(s)")
            if (ex.emails.isNotEmpty()) add("${ex.emails.size} email address(es)")
            if (content.isEmpty()) add("binary content not inspected")
        }.joinToString(", ") + "."

        return AnalysisResult(
            summary, names, ex.phones, ex.emails, ex.urls, domains, ex.dates,
            if (content.isNotEmpty()) keywords(content) else emptyList(), patterns, risk,
        )
    }

    fun toJson(a: AnalysisResult): JSONObject = JSONObject()
        .put("summary", a.summary).put("risk", a.riskScore).put("at", a.analyzedAt)
        .put("names", JSONArray(a.names)).put("phones", JSONArray(a.phones)).put("emails", JSONArray(a.emails))
        .put("urls", JSONArray(a.urls)).put("domains", JSONArray(a.domains)).put("dates", JSONArray(a.dates))
        .put("keywords", JSONArray(a.keywords)).put("patterns", JSONArray(a.patterns))

    fun fromJson(o: JSONObject): AnalysisResult {
        fun l(k: String) = o.optJSONArray(k)?.let { a -> List(a.length()) { a.getString(it) } } ?: emptyList()
        return AnalysisResult(
            o.optString("summary"), l("names"), l("phones"), l("emails"), l("urls"), l("domains"),
            l("dates"), l("keywords"), l("patterns"), o.optDouble("risk", 0.0), o.optLong("at"),
        )
    }
}
