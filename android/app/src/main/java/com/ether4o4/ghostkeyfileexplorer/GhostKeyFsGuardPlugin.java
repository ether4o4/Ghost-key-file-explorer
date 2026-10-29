package com.ether4o4.ghostkeyfileexplorer;

import android.net.Uri;
import android.system.Os;
import android.system.StructStat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/** No grants, writes or alternate access paths: validates existing file-path capabilities. */
@CapacitorPlugin(name = "GhostKeyFsGuard")
public class GhostKeyFsGuardPlugin extends Plugin {
    @PluginMethod
    public void inspectDirectory(PluginCall call) {
        try {
            File directory = FsVerification.path(call.getString("path"));
            File[] children = FsVerification.list(directory);
            JSArray files = new JSArray();
            for (File child : children) {
                StructStat stat = Os.lstat(child.getPath());
                JSObject entry = new JSObject();
                entry.put("name", child.getName());
                entry.put("type", child.isDirectory() ? "directory" : "file");
                entry.put("uri", Uri.fromFile(child).toString());
                entry.put("nativeId", stat.st_dev + ":" + stat.st_ino);
                entry.put("unsupportedSymlink", !child.getAbsoluteFile().equals(child.getCanonicalFile()));
                entry.put("size", child.length());
                entry.put("mtime", child.lastModified());
                files.put(entry);
            }
            JSObject result = new JSObject();
            result.put("canonicalUri", Uri.fromFile(directory).toString());
            result.put("files", files);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void verifyTree(PluginCall call) {
        try {
            FsVerification.checkTree(FsVerification.path(call.getString("path")));
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void verifyCopy(PluginCall call) {
        try {
            FsVerification.compare(FsVerification.path(call.getString("from")), FsVerification.path(call.getString("to")));
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }
}
