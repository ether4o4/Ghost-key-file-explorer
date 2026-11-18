package com.ghostkey.explorer.intel

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.ghostkey.explorer.files.Trash
import java.io.File
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

// Limbo: open risky archives in an isolated, bounded staging workspace inside
// app-private cache. Nothing touches your real folders until you choose
// "Repackage & place", which only writes after the rebuilt ZIP verifies.
data class LimboEntry(val path: String, val size: Long, val isDir: Boolean)

data class LimboWorkspace(
    val id: String,
    val archiveName: String,
    val sourcePath: String,
    val dir: File,
    val entries: List<LimboEntry>,
    val totalBytes: Long,
    val fileCount: Int,
    val status: String = "pending", // pending | clean | flagged
    val log: List<String> = emptyList(),
    val findings: AnalysisResult? = null,
)

object Limbo {
    const val MAX_ENTRIES = 20_000
    const val MAX_TOTAL_BYTES = 1L shl 30 // 1 GiB uncompressed
    const val MAX_RATIO = 200.0

    private lateinit var root: File
    var workspace by mutableStateOf<LimboWorkspace?>(null)
        private set

    fun init(context: Context) {
        root = File(context.cacheDir, "limbo").apply { mkdirs() }
        // Workspaces never survive a restart: stale staging is cleared
        root.listFiles().orEmpty().forEach { it.deleteRecursively() }
    }

    /** Tests: stage into a plain directory. */
    internal fun initRoot(dir: File) {
        root = dir.apply { mkdirs() }
    }

    fun isInside(path: File): Boolean = ::root.isInitialized && path.absolutePath.startsWith(root.absolutePath)

    /** Canonical, safe relative path for an archive member, or an error. */
    fun safeRelative(name: String): String {
        val norm = name.replace('\\', '/')
        require(!norm.startsWith("/") && !Regex("^[A-Za-z]:").containsMatchIn(norm)) { "Archive rejected: absolute path \"$name\"" }
        val parts = norm.split('/').filter { it.isNotEmpty() && it != "." }
        require(parts.isNotEmpty()) { "Archive rejected: empty path" }
        require(parts.none { it == ".." }) { "Archive rejected: path escapes the archive \"$name\"" }
        require(parts.none { it.contains('\u0000') }) { "Archive rejected: invalid name" }
        return parts.joinToString("/")
    }

    private fun stamp() = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.ROOT).format(java.util.Date())

    fun open(archive: File): LimboWorkspace {
        require(archive.isFile && archive.extension.equals("zip", true)) { "Limbo inspection is for .zip archives" }
        val entries = mutableListOf<LimboEntry>()
        val id = "ws-" + java.util.UUID.randomUUID().toString().take(8)
        val dir = File(root, id).apply { mkdirs() }
        val canonRoot = dir.canonicalPath + File.separator
        try {
            ZipFile(archive).use { zip ->
                val all = zip.entries().toList()
                require(all.size <= MAX_ENTRIES) { "Archive rejected: more than $MAX_ENTRIES entries" }
                val seen = HashMap<String, Boolean>()
                var declared = 0L
                for (e in all) {
                    val rel = safeRelative(e.name)
                    require(seen.put(rel, e.isDirectory) == null) { "Archive rejected: duplicate path \"$rel\"" }
                    if (e.size > 0) declared += e.size
                    require(declared <= MAX_TOTAL_BYTES) { "Archive rejected: uncompressed size exceeds 1 GiB" }
                }
                // A file may not also be a parent directory of another entry
                for (p in seen.keys) {
                    var parent = p.substringBeforeLast('/', "")
                    while (parent.isNotEmpty()) {
                        require(seen[parent] != false) { "Archive rejected: file/folder collision at \"$p\"" }
                        parent = parent.substringBeforeLast('/', "")
                    }
                }
                if (declared > 50L * 1024 * 1024 && declared / archive.length().coerceAtLeast(1).toDouble() > MAX_RATIO) {
                    error("Archive rejected: suspicious compression ratio (possible ZIP bomb)")
                }
                var written = 0L
                val buf = ByteArray(1 shl 16)
                for (e in all) {
                    val rel = safeRelative(e.name)
                    val out = File(dir, rel)
                    require(out.canonicalPath.startsWith(canonRoot)) { "Archive rejected: path escapes workspace" }
                    if (e.isDirectory) {
                        out.mkdirs()
                        entries += LimboEntry(rel, 0, true)
                        continue
                    }
                    out.parentFile?.mkdirs()
                    var size = 0L
                    val crc = CRC32()
                    zip.getInputStream(e).use { input ->
                        out.outputStream().buffered().use { output ->
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                size += n
                                written += n
                                // Real output is bounded even if headers lie
                                require(written <= MAX_TOTAL_BYTES) { "Archive rejected: expands past 1 GiB" }
                                require(e.size < 0 || size <= e.size) { "Archive rejected: \"$rel\" is larger than declared" }
                                crc.update(buf, 0, n)
                                output.write(buf, 0, n)
                            }
                        }
                    }
                    require(e.crc < 0 || crc.value == e.crc) { "Archive rejected: checksum mismatch in \"$rel\"" }
                    entries += LimboEntry(rel, size, false)
                }
            }
        } catch (t: Throwable) {
            dir.deleteRecursively()
            throw t
        }
        workspace?.dir?.deleteRecursively()
        val ws = LimboWorkspace(
            id, archive.name, archive.absolutePath, dir, entries,
            entries.sumOf { it.size }, entries.count { !it.isDir },
            log = listOf("[${stamp()}] Extracted ${entries.count { !it.isDir }} file(s) into isolated workspace"),
        )
        workspace = ws
        Timeline.record("limbo_opened", "Opened \"${archive.name}\" in Limbo (${ws.fileCount} files)", archive.absolutePath)
        return ws
    }

    /** Entity extraction across staged text files; flags personal data. */
    fun analyze(): LimboWorkspace? {
        val ws = workspace ?: return null
        val log = ws.log.toMutableList()
        log += "[${stamp()}] Starting analysis…"
        val phones = LinkedHashSet<String>(); val emails = LinkedHashSet<String>()
        val urls = LinkedHashSet<String>(); val domains = LinkedHashSet<String>()
        val dates = LinkedHashSet<String>(); val keywords = LinkedHashSet<String>()
        ws.dir.walkTopDown().filter { it.isFile }.take(2000).forEach { f ->
            val text = Tagger.readTextSample(f) ?: return@forEach
            log += "[${stamp()}] Analyzing ${f.relativeTo(ws.dir).path}"
            val ex = Tagger.extract(text)
            phones += ex.phones; emails += ex.emails; urls += ex.urls; domains += ex.domains; dates += ex.dates
            keywords += Analyzer.keywords(text, 5)
        }
        val status = if (phones.isNotEmpty() || emails.isNotEmpty()) "flagged" else "clean"
        log += "[${stamp()}] Analysis complete. Status: $status"
        log += "  → ${phones.size} phones, ${emails.size} emails, ${urls.size} URLs"
        val result = AnalysisResult(
            summary = "${ws.fileCount} staged file(s); status $status.",
            names = emptyList(), phones = phones.toList(), emails = emails.toList(), urls = urls.toList(),
            domains = domains.toList(), dates = dates.toList(), keywords = keywords.take(15).toList(),
            patterns = emptyList(), riskScore = (phones.size * 0.5 + emails.size * 0.3).coerceAtMost(10.0),
        )
        val updated = ws.copy(status = status, log = log, findings = result)
        workspace = updated
        Timeline.record("limbo_analyzed", "Limbo analysis of \"${ws.archiveName}\": $status")
        return updated
    }

    /**
     * Rebuild the (possibly edited) workspace into a ZIP, verify it entry by
     * entry (names, sizes, CRC32), and only then place it into [destDir].
     */
    fun repackagePlace(destDir: File, requestedName: String): File {
        val ws = workspace ?: error("No Limbo workspace is open")
        val name = requestedName.trim().let { if (it.endsWith(".zip", true)) it else "$it.zip" }
        require(name.length > 4 && !name.contains('/') && !name.contains('\\')) { "Use a file name without folders" }
        require(destDir.isDirectory && destDir.canWrite()) { "Can't write to ${destDir.name}" }
        val files = ws.dir.walkTopDown().filter { it != ws.dir }.sortedBy { it.relativeTo(ws.dir).invariantSeparatorsPath }.toList()
        require(files.isNotEmpty()) { "Nothing staged to repackage" }
        val expected = HashMap<String, Pair<Long, Long>>() // name -> (size, crc)
        val tmp = File(destDir, ".$name.gkpart")
        try {
            ZipOutputStream(tmp.outputStream().buffered()).use { zos ->
                val buf = ByteArray(1 shl 16)
                for (f in files) {
                    val rel = f.relativeTo(ws.dir).invariantSeparatorsPath
                    if (f.isDirectory) {
                        zos.putNextEntry(ZipEntry("$rel/")); zos.closeEntry()
                        expected["$rel/"] = 0L to 0L
                        continue
                    }
                    zos.putNextEntry(ZipEntry(rel).apply { time = f.lastModified() })
                    val crc = CRC32()
                    var size = 0L
                    f.inputStream().use { input ->
                        while (true) { val n = input.read(buf); if (n < 0) break; crc.update(buf, 0, n); size += n; zos.write(buf, 0, n) }
                    }
                    zos.closeEntry()
                    expected[rel] = size to crc.value
                }
            }
            ZipFile(tmp).use { zip ->
                val got = zip.entries().toList()
                require(got.size == expected.size) { "Repackage verification failed: entry count" }
                val buf = ByteArray(1 shl 16)
                for (e in got) {
                    val (size, crc) = expected[e.name] ?: error("Repackage verification failed: ${e.name}")
                    if (e.isDirectory) continue
                    val c = CRC32(); var n = 0L
                    zip.getInputStream(e).use { input -> while (true) { val r = input.read(buf); if (r < 0) break; c.update(buf, 0, r); n += r } }
                    require(n == size && c.value == crc) { "Repackage verification failed: ${e.name}" }
                }
            }
            val target = Trash.uniqueName(destDir, name)
            require(tmp.renameTo(target)) { "Could not place ${target.name}" }
            workspace = ws.copy(log = ws.log + "[${stamp()}] Repackaged and verified → ${target.absolutePath}")
            Timeline.record("limbo_placed", "Placed \"${target.name}\" (${expected.size} entries, verified)", target.absolutePath)
            return target
        } finally {
            tmp.delete()
        }
    }

    fun discard() {
        val ws = workspace ?: return
        ws.dir.deleteRecursively()
        workspace = null
        Timeline.record("limbo_discarded", "Limbo workspace for \"${ws.archiveName}\" discarded")
    }
}
