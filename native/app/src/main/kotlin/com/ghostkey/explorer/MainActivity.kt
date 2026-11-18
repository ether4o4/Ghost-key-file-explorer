package com.ghostkey.explorer

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.ghostkey.explorer.intel.Vaults
import com.ghostkey.explorer.shell.ShellScreen
import com.ghostkey.explorer.widget.WidgetBindings

/** A request coming from outside the shell (a widget tap, a share). */
object ShellRequests {
    sealed interface Request
    data class OpenFolder(val folderId: String) : Request
    data class OpenPath(val path: String) : Request

    var pending by mutableStateOf<Request?>(null)
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        handle(intent)
        setContent { ShellScreen() }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    override fun onResume() {
        super.onResume()
        Vaults.wipeExpired()
    }

    override fun onStop() {
        super.onStop()
        // Vault keys never linger once you leave the app
        if (!isChangingConfigurations) Vaults.lockAll()
    }

    private fun handle(intent: Intent?) {
        intent ?: return
        intent.getStringExtra(WidgetBindings.EXTRA_OPEN_FOLDER)?.let { ShellRequests.pending = ShellRequests.OpenFolder(it) }
        intent.getStringExtra(WidgetBindings.EXTRA_OPEN_PATH)?.let { ShellRequests.pending = ShellRequests.OpenPath(it) }
    }
}
