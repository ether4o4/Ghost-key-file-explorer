package com.ghostkey.explorer

import com.ghostkey.explorer.data.JsonStore
import com.ghostkey.explorer.intel.Limbo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

class LimboTest {
    @get:Rule val tmp = TemporaryFolder()

    @Before fun setUp() {
        JsonStore.initDir(tmp.newFolder("store"))
        Limbo.initRoot(tmp.newFolder("limbo"))
    }

    private fun zip(name: String, entries: Map<String, String?>): File {
        val f = File(tmp.root, name)
        ZipOutputStream(f.outputStream()).use { z ->
            entries.forEach { (path, content) ->
                z.putNextEntry(ZipEntry(path))
                content?.let { z.write(it.toByteArray()) }
                z.closeEntry()
            }
        }
        return f
    }

    @Test fun safeRelativeRejectsEscapes() {
        listOf("../evil", "a/../../b", "/etc/passwd", "C:\\win", "..", "./").forEach { bad ->
            assertThrows(bad, IllegalArgumentException::class.java) { Limbo.safeRelative(bad) }
        }
        assertEquals("a/b", Limbo.safeRelative("a/./b"))
        assertEquals("a/b/c.txt", Limbo.safeRelative("a\\b\\c.txt"))
    }

    @Test fun zipSlipArchiveIsRejectedAndNothingEscapes() {
        val evil = zip("evil.zip", mapOf("ok.txt" to "fine", "../../escaped.txt" to "pwned"))
        assertThrows(IllegalArgumentException::class.java) { Limbo.open(evil) }
        assertFalse(File(tmp.root, "escaped.txt").exists())
        assertFalse(File(tmp.root.parentFile, "escaped.txt").exists())
        assertEquals(null, Limbo.workspace)
    }

    @Test fun fileFolderCollisionIsRejected() {
        val bad = zip("collide.zip", mapOf("a" to "file", "a/b.txt" to "child"))
        assertThrows(IllegalArgumentException::class.java) { Limbo.open(bad) }
    }

    @Test fun extractsAnalyzesAndRepackagesWithVerification() {
        val good = zip(
            "good.zip",
            mapOf("docs/" to null, "docs/note.txt" to "Call Jane Smith at 555-123-4567 or jane@example.com", "img.bin" to "\u0001\u0002"),
        )
        val ws = Limbo.open(good)
        assertEquals(2, ws.fileCount)
        assertTrue(File(ws.dir, "docs/note.txt").isFile)

        val analyzed = Limbo.analyze()!!
        assertEquals("flagged", analyzed.status)
        assertTrue(analyzed.findings!!.emails.contains("jane@example.com"))

        // Edit inside the workspace, then rebuild
        File(ws.dir, "img.bin").delete()
        val dest = tmp.newFolder("dest")
        val placed = Limbo.repackagePlace(dest, "rebuilt")
        assertEquals("rebuilt.zip", placed.name)
        ZipFile(placed).use { z ->
            val names = z.entries().toList().map { it.name }.toSet()
            assertEquals(setOf("docs/", "docs/note.txt"), names)
        }
        // Placing again never overwrites
        assertEquals("rebuilt (1).zip", Limbo.repackagePlace(dest, "rebuilt.zip").name)

        Limbo.discard()
        assertFalse(ws.dir.exists())
    }
}
