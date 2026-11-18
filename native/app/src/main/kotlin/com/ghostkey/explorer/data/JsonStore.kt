package com.ghostkey.explorer.data

import android.content.Context
import java.io.File

// Tiny atomic JSON-file persistence in app-private storage. Everything Ghost
// Key remembers (folders, desktop layout, tags, timeline, vault metadata) is
// local to the device; nothing is uploaded anywhere.
object JsonStore {
    private lateinit var dir: File

    fun init(context: Context) {
        dir = File(context.filesDir, "ghostkey").apply { mkdirs() }
    }

    /** Tests: use a plain directory instead of app storage. */
    internal fun initDir(directory: File) {
        dir = directory.apply { mkdirs() }
    }

    fun read(name: String): String? = runCatching {
        val f = File(dir, name)
        if (f.exists()) f.readText() else null
    }.getOrNull()

    @Synchronized
    fun write(name: String, text: String) {
        runCatching {
            val tmp = File(dir, "$name.tmp")
            tmp.writeText(text)
            val target = File(dir, name)
            if (!tmp.renameTo(target)) {
                target.writeText(text)
                tmp.delete()
            }
        }
    }
}
