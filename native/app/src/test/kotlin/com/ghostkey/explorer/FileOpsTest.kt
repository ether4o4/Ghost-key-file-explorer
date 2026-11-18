package com.ghostkey.explorer

import com.ghostkey.explorer.data.JsonStore
import com.ghostkey.explorer.explorer.SortKey
import com.ghostkey.explorer.explorer.sortFiles
import com.ghostkey.explorer.files.FileOps
import com.ghostkey.explorer.intel.FileIndex
import com.ghostkey.explorer.intel.Tagger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class FileOpsTest {
    @get:Rule val tmp = TemporaryFolder()

    @Before fun setUp() { JsonStore.initDir(tmp.newFolder("store")) }

    @Test fun moveNeverOverwritesAndKeepsBoth() {
        val src = tmp.newFolder("src")
        val dst = tmp.newFolder("dst")
        File(src, "a.txt").writeText("new")
        File(dst, "a.txt").writeText("old")
        val r = FileOps.transfer(listOf(File(src, "a.txt")), dst, copy = false)
        assertEquals(1, r.done)
        assertEquals("old", File(dst, "a.txt").readText())
        assertEquals("new", File(dst, "a (1).txt").readText())
        assertFalse(File(src, "a.txt").exists())
    }

    @Test fun folderCannotGoInsideItself() {
        val parent = tmp.newFolder("p")
        val child = File(parent, "c").apply { mkdirs() }
        val r = FileOps.transfer(listOf(parent), child, copy = false)
        assertEquals(1, r.failed)
        assertTrue(parent.exists() && child.exists())
    }

    @Test fun copyKeepsOriginalAndCopiesFolders() {
        val src = tmp.newFolder("s")
        File(src, "x/y").mkdirs()
        File(src, "x/y/z.txt").writeText("z")
        val dst = tmp.newFolder("d")
        FileOps.transfer(listOf(File(src, "x")), dst, copy = true)
        assertEquals("z", File(dst, "x/y/z.txt").readText())
        assertTrue(File(src, "x/y/z.txt").exists())
    }

    @Test fun tagsFollowAMovedFile() {
        val src = tmp.newFolder("tsrc")
        val dst = tmp.newFolder("tdst")
        val f = File(src, "Report-Alice.txt").apply { writeText("hello") }
        val rec = FileIndex.ensure(f)
        FileOps.transfer(listOf(f), dst, copy = false)
        val moved = FileIndex.get(File(dst, f.name).absolutePath)
        assertEquals(rec.sku, moved?.sku)
        assertEquals(null, FileIndex.get(f.absolutePath))
    }

    @Test fun renameRejectsClashesAndSlashes() {
        val d = tmp.newFolder("r")
        val a = File(d, "a.txt").apply { writeText("a") }
        File(d, "b.txt").writeText("b")
        assertTrue(FileOps.rename(a, "b.txt").isFailure)
        assertTrue(FileOps.rename(a, "x/y").isFailure)
        assertEquals("c.txt", FileOps.rename(a, "c.txt").getOrThrow().name)
    }

    @Test fun foldersSortFirstInEveryOrder() {
        val d = tmp.newFolder("sort")
        File(d, "b.txt").writeText("bb")
        File(d, "a.txt").writeText("a")
        File(d, "zdir").mkdirs()
        val files = d.listFiles()!!.toList()
        assertEquals(listOf("zdir", "a.txt", "b.txt"), sortFiles(files, SortKey.NAME, true).map { it.name })
        assertEquals(listOf("zdir", "b.txt", "a.txt"), sortFiles(files, SortKey.NAME, false).map { it.name })
    }

    @Test fun taggerExtractsWhoWhatWhere() {
        val tags = Tagger.autoTag(File("/storage/emulated/0/WhatsApp/Media/Jane-photo.jpg"), null)
        assertTrue(tags.any { it.dimension == "what" && it.value == "Image" })
        assertTrue(tags.any { it.dimension == "where" && it.value == "WhatsApp" })
        assertTrue(tags.any { it.dimension == "who" && it.value == "Jane" })
        val ex = Tagger.extract("mail bob@site.org or call 555-201-3344, see https://x.io/a")
        assertEquals(listOf("bob@site.org"), ex.emails)
        assertTrue(ex.urls.single().startsWith("https://x.io"))
    }
}
