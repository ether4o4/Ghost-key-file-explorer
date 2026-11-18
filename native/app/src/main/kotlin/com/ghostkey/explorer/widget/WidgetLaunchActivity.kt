package com.ghostkey.explorer.widget

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import com.ghostkey.explorer.MainActivity
import com.ghostkey.explorer.apps.InstalledAppsRepository
import com.ghostkey.explorer.files.FileOpener
import java.io.File

// Invisible hop for widget taps: launches the app or opens the file, then
// finishes immediately.
class WidgetLaunchActivity : Activity() {
    companion object {
        const val EXTRA_KIND = "com.ghostkey.explorer.KIND"
        const val EXTRA_VALUE = "com.ghostkey.explorer.VALUE"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val kind = intent.getStringExtra(EXTRA_KIND)
        val value = intent.getStringExtra(EXTRA_VALUE)
        if (kind != null && value != null) {
            when (kind) {
                "app" -> if (!InstalledAppsRepository.launch(this, value)) {
                    Toast.makeText(this, "That app isn't installed anymore", Toast.LENGTH_SHORT).show()
                }
                "file" -> {
                    val f = File(value)
                    when {
                        !f.exists() -> Toast.makeText(this, "${f.name} was moved or deleted", Toast.LENGTH_SHORT).show()
                        f.isDirectory -> startActivity(
                            Intent(this, MainActivity::class.java)
                                .putExtra(WidgetBindings.EXTRA_OPEN_PATH, f.absolutePath)
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                        )
                        else -> FileOpener.open(this, f)
                    }
                }
            }
        }
        finish()
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
    }
}
