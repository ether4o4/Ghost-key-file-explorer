package com.ghostkey.explorer.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

// In-shell notifications (bottom-center, above the taskbar).
object Toasts {
    data class Toast(val message: String, val kind: Kind, val id: Long = System.nanoTime())
    enum class Kind { INFO, SUCCESS, ERROR }

    var current by mutableStateOf<Toast?>(null)
        private set

    fun show(message: String, kind: Kind = Kind.INFO) {
        if (message.isBlank()) return
        val post = { current = Toast(message, kind) }
        val main = android.os.Looper.getMainLooper()
        if (android.os.Looper.myLooper() == main) post() else android.os.Handler(main).post { post() }
    }

    fun success(message: String) = show(message, Kind.SUCCESS)
    fun error(message: String) = show(message, Kind.ERROR)

    fun dismiss(id: Long) { if (current?.id == id) current = null }
}
