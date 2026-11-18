package com.ghostkey.explorer.intel

import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// Ghost Key auto-tagger: who / what / when / where from the file name,
// extension, location and (for small text files) content.
data class Tag(val dimension: String, val value: String, val confidence: Double = 1.0)

data class Extracted(
    val phones: List<String> = emptyList(),
    val emails: List<String> = emptyList(),
    val urls: List<String> = emptyList(),
    val domains: List<String> = emptyList(),
    val dates: List<String> = emptyList(),
)

object Tagger {
    val DIMENSIONS = listOf("who", "what", "when", "where")

    private val PERSON = listOf(
        Regex("""\b([A-Z][a-z]+ [A-Z][a-z]+)\b"""),
        Regex("""\bfrom[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)"""),
        Regex("""\bcontact[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)"""),
    )
    private val PHONE = listOf(
        Regex("""(\+?1?\s?[\-(]?\d{3}[\-\s)]+\d{3}[\-\s]+\d{4})\b"""),
        Regex("""\b(\d{3}[-.\s]\d{3}[-.\s]\d{4})\b"""),
    )
    private val EMAIL = listOf(Regex("""\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b"""))
    private val URL = listOf(Regex("""https?://[^\s<>"{}|\\^`\[\]]+"""))
    private val DOMAIN = listOf(
        Regex("""\b(snapchat|instagram|facebook|twitter|icloud|google|whatsapp|telegram|discord|tiktok|youtube)\b""", RegexOption.IGNORE_CASE),
    )
    private val DATE = listOf(
        Regex("""\b(\d{4}[-/]\d{2}[-/]\d{2})\b"""),
        Regex("""\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b""", RegexOption.IGNORE_CASE),
    )

    private val EXT_WHAT = mapOf(
        "jpg" to "Image", "jpeg" to "Image", "png" to "Image", "gif" to "Image", "webp" to "Image",
        "heic" to "Image", "heif" to "Image", "raw" to "RAW Photo", "cr2" to "RAW Photo", "dng" to "RAW Photo",
        "mp4" to "Video", "mov" to "Video", "avi" to "Video", "mkv" to "Video", "webm" to "Video",
        "mp3" to "Audio", "wav" to "Audio", "flac" to "Audio", "m4a" to "Audio", "aac" to "Audio", "ogg" to "Audio",
        "pdf" to "Document", "doc" to "Document", "docx" to "Document", "txt" to "Text", "md" to "Markdown",
        "csv" to "Spreadsheet", "xls" to "Spreadsheet", "xlsx" to "Spreadsheet",
        "zip" to "Archive", "tar" to "Archive", "gz" to "Archive", "rar" to "Archive", "7z" to "Archive",
        "js" to "Code", "ts" to "Code", "kt" to "Code", "py" to "Code", "java" to "Code", "cpp" to "Code",
        "json" to "Data", "xml" to "Data", "sql" to "Database", "db" to "Database", "sqlite" to "Database",
        "log" to "Log", "apk" to "App package",
    )

    private val SOURCE_WHERE = linkedMapOf(
        "snapchat" to "Snapchat", "instagram" to "Instagram", "facebook" to "Facebook",
        "icloud" to "iCloud", "whatsapp" to "WhatsApp", "telegram" to "Telegram", "discord" to "Discord",
        "dcim" to "Camera", "screenshots" to "Screenshots", "download" to "Downloads",
        "desktop" to "Desktop", "documents" to "Documents", "backup" to "Backup", "email" to "Email",
        "bluetooth" to "Bluetooth", "recordings" to "Recordings",
    )

    fun what(ext: String): Tag = Tag("what", EXT_WHAT[ext.lowercase(Locale.ROOT)] ?: if (ext.isEmpty()) "File" else ext.uppercase(Locale.ROOT) + " file")

    fun whenTag(ts: Long): Tag = Tag("when", SimpleDateFormat("MMM yyyy", Locale.US).format(Date(ts)))

    fun where(path: String): Tag {
        val lower = path.lowercase(Locale.ROOT)
        // Deepest matching folder wins (e.g. WhatsApp/Media beats Download)
        val match = SOURCE_WHERE.entries
            .mapNotNull { (k, v) -> lower.lastIndexOf("/$k").takeIf { it >= 0 }?.let { it to v } }
            .maxByOrNull { it.first }
        return match?.let { Tag("where", it.second) }
            ?: Tag("where", File(path).parentFile?.name?.ifEmpty { null } ?: "Unknown", 0.8)
    }

    fun who(filename: String, content: String?): List<Tag> {
        val out = mutableListOf<Tag>()
        val seen = mutableSetOf<String>()
        listOf(Regex("""^([A-Z][a-z]+)[-_\s]"""), Regex("""[-_\s]([A-Z][a-z]+)\.""")).forEach { p ->
            p.find(filename)?.groupValues?.getOrNull(1)?.takeIf { it.length > 2 && seen.add(it) }
                ?.let { out += Tag("who", it, 0.7) }
        }
        if (content != null) {
            loop@ for (p in PERSON) {
                for (m in p.findAll(content)) {
                    val name = m.groupValues[1].trim()
                    if (name.length > 3 && seen.add(name)) out += Tag("who", name, 0.85)
                    if (out.size >= 5) break@loop
                }
            }
        }
        return out
    }

    fun autoTag(file: File, content: String?): List<Tag> =
        listOf(what(file.extension), whenTag(file.lastModified()), where(file.absolutePath)) +
            who(file.name, content)

    fun extract(content: String): Extracted {
        fun ex(patterns: List<Regex>): List<String> {
            val seen = LinkedHashSet<String>()
            for (p in patterns) for (m in p.findAll(content)) {
                seen += (m.groupValues.getOrNull(1)?.takeIf { it.isNotEmpty() } ?: m.value).trim()
                if (seen.size >= 20) break
            }
            return seen.toList()
        }
        return Extracted(ex(PHONE), ex(EMAIL), ex(URL), ex(DOMAIN), ex(DATE))
    }

    private val TEXT_EXT = setOf("txt", "md", "log", "csv", "json", "xml", "html", "htm", "js", "ts", "kt", "py", "java", "ini", "cfg", "conf", "yml", "yaml", "sql", "vcf", "eml", "srt")

    /** Reads up to 512 KB of a text-like file for analysis; null for binaries. */
    fun readTextSample(file: File): String? {
        if (!file.isFile || file.extension.lowercase(Locale.ROOT) !in TEXT_EXT) return null
        return runCatching {
            file.inputStream().use { input ->
                val buf = ByteArray(minOf(file.length(), 512L * 1024).toInt())
                var read = 0
                while (read < buf.size) {
                    val n = input.read(buf, read, buf.size - read)
                    if (n < 0) break
                    read += n
                }
                String(buf, 0, read, Charsets.UTF_8)
            }
        }.getOrNull()
    }
}
