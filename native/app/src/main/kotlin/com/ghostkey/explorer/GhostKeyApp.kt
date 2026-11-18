package com.ghostkey.explorer

import android.app.Application
import com.ghostkey.explorer.data.AppFolders
import com.ghostkey.explorer.data.DesktopLayout
import com.ghostkey.explorer.data.FolderPrefs
import com.ghostkey.explorer.data.JsonStore
import com.ghostkey.explorer.data.Settings
import com.ghostkey.explorer.intel.FileIndex
import com.ghostkey.explorer.intel.Limbo
import com.ghostkey.explorer.intel.Timeline
import com.ghostkey.explorer.intel.Vaults

class GhostKeyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        JsonStore.init(this)
        Settings.init(this)
        Timeline.init()
        AppFolders.init(this)
        DesktopLayout.init()
        FolderPrefs.init()
        FileIndex.init()
        Vaults.init(this)
        Limbo.init(this)
    }
}
