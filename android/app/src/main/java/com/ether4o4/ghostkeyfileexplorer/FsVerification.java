package com.ether4o4.ghostkeyfileexplorer;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.net.URI;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;

/** Read-only postconditions for the existing Capacitor file-path operations. */
final class FsVerification {
    static File path(String uri) throws Exception {
        if (uri == null) throw new IOException("Missing filesystem path");
        File file;
        if (uri.startsWith("/")) file = new File(uri);
        else {
            URI parsed = new URI(uri);
            if (!"file".equals(parsed.getScheme())) throw new IOException("SAF/content providers are not supported by this file-path backend");
            file = new File(parsed);
        }
        return file.getCanonicalFile();
    }

    static File[] list(File directory) throws IOException {
        if (!directory.isDirectory() || !directory.canRead()) throw new IOException("Folder is unavailable or permission denied");
        File[] children = directory.listFiles();
        if (children == null) throw new IOException("Provider could not read folder");
        return children;
    }

    static byte[] digest(File file) throws IOException {
        try {
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[65536];
            try (FileInputStream stream = new FileInputStream(file)) {
                int count;
                while ((count = stream.read(buffer)) != -1) hash.update(buffer, 0, count);
            }
            return hash.digest();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IOException("SHA-256 unavailable", impossible);
        }
    }

    static void checkTree(File file) throws IOException {
        if (!file.getAbsoluteFile().equals(file.getCanonicalFile())) {
            throw new IOException("Symbolic-link mutations are unsupported by this file-path backend");
        }
        if (file.isDirectory()) {
            for (File child : list(file)) checkTree(child);
        } else if (!file.isFile() || !file.canRead()) {
            throw new IOException("Source is unavailable or permission denied");
        }
    }

    static void compare(File source, File destination) throws IOException {
        checkTree(source);
        checkTree(destination);
        compareChecked(source, destination);
    }

    private static void compareChecked(File source, File destination) throws IOException {
        if (source.isDirectory()) {
            if (!destination.isDirectory()) throw new IOException("Copy verification failed: missing destination folder");
            File[] sourceChildren = list(source);
            File[] destinationChildren = list(destination);
            if (sourceChildren.length != destinationChildren.length) throw new IOException("Copy verification failed: directory entries differ");
            for (File child : sourceChildren) compareChecked(child, new File(destination, child.getName()));
        } else {
            if (!source.isFile() || !destination.isFile() || source.length() != destination.length()
                || !Arrays.equals(digest(source), digest(destination))) {
                throw new IOException("Copy verification failed: file bytes differ");
            }
        }
    }
}
