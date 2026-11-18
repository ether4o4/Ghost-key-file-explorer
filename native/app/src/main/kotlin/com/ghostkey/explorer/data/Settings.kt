package com.ghostkey.explorer.data

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.ghostkey.explorer.theme.ThemePreset

// User preferences, exposed as Compose state so the whole shell reacts.
object Settings {
    private const val PREFS = "ghostkey_settings"
    private lateinit var appContext: Context

    var themePreset by mutableStateOf(ThemePreset.DARK)
        private set
    var dualPaneDefault by mutableStateOf(true)
        private set
    var dragCopies by mutableStateOf(false)
        private set
    var showHidden by mutableStateOf(false)
        private set

    fun init(context: Context) {
        appContext = context.applicationContext
        val p = prefs()
        themePreset = runCatching { ThemePreset.valueOf(p.getString("theme", "DARK")!!) }
            .getOrDefault(ThemePreset.DARK)
        dualPaneDefault = p.getBoolean("dualPane", true)
        dragCopies = p.getBoolean("dragCopies", false)
        showHidden = p.getBoolean("showHidden", false)
    }

    private fun prefs() = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun updateTheme(preset: ThemePreset) {
        themePreset = preset
        prefs().edit().putString("theme", preset.name).apply()
    }

    fun updateDualPaneDefault(value: Boolean) {
        dualPaneDefault = value
        prefs().edit().putBoolean("dualPane", value).apply()
    }

    fun updateDragCopies(value: Boolean) {
        dragCopies = value
        prefs().edit().putBoolean("dragCopies", value).apply()
    }

    fun updateShowHidden(value: Boolean) {
        showHidden = value
        prefs().edit().putBoolean("showHidden", value).apply()
    }
}
