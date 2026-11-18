package com.ghostkey.explorer.files

import android.content.Context
import android.content.Intent
import android.webkit.MimeTypeMap
import android.widget.Toast
import androidx.core.content.FileProvider
import com.ghostkey.explorer.intel.Timeline
import java.io.File

object FileOpener {
    fun mimeOf(file: File): String =
        MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase()) ?: "*/*"

    fun open(context: Context, file: File) {
        val ok = runCatching {
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            context.startActivity(
                Intent.createChooser(
                    Intent(Intent.ACTION_VIEW).setDataAndType(uri, mimeOf(file))
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
                    "Open ${file.name}",
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }.isSuccess
        if (ok) Timeline.record("file_opened", "Opened \"${file.name}\"", file.absolutePath)
        else Toast.makeText(context, "No app can open ${file.name}", Toast.LENGTH_SHORT).show()
    }

    fun share(context: Context, files: List<File>) {
        runCatching {
            val uris = ArrayList(files.filter { it.isFile }.map {
                FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", it)
            })
            if (uris.isEmpty()) return
            val intent = if (uris.size == 1) {
                Intent(Intent.ACTION_SEND).setType(mimeOf(files.first())).putExtra(Intent.EXTRA_STREAM, uris.first())
            } else {
                Intent(Intent.ACTION_SEND_MULTIPLE).setType("*/*").putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            }
            context.startActivity(
                Intent.createChooser(intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Share")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
    }
}
