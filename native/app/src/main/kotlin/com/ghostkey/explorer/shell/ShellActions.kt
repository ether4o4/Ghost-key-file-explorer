package com.ghostkey.explorer.shell

import androidx.compose.runtime.compositionLocalOf

// What any window can ask the shell to do.
interface ShellActions {
    fun openExplorer(path: String? = null, newWindow: Boolean = false)
    fun openAppFolder(folderId: String)
    fun openInspector(path: String)
    fun openVaults(addPath: String? = null)
    fun openLimbo()
    fun openTimeline()
    fun openSettings()
    /** Ask the launcher to place this app folder on the home screen. */
    fun pinToHomeScreen(folderId: String)
    fun closeWindow(windowId: String)
    fun setWindowTitle(windowId: String, title: String)
}

val LocalShellActions = compositionLocalOf<ShellActions> { error("ShellActions not provided") }
