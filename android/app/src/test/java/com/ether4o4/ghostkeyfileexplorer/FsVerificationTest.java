package com.ether4o4.ghostkeyfileexplorer;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import static org.junit.Assert.*;

/** JVM/Linux file validation tests; not Android permission/provider runtime proof. */
public class FsVerificationTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    @Test public void exactBytesAndSameLengthCorruption() throws Exception {
        File source = temporary.newFile("source.bin");
        File destination = temporary.newFile("destination.bin");
        byte[] bytes = new byte[] {0, (byte) 255, 1, (byte) 128, 10, 0};
        Files.write(source.toPath(), bytes);
        Files.write(destination.toPath(), bytes);
        FsVerification.compare(source, destination);
        Files.write(destination.toPath(), new byte[] {0, (byte) 255, 1, (byte) 128, 10, 1});
        assertThrows(IOException.class, () -> FsVerification.compare(source, destination));
        assertArrayEquals(bytes, Files.readAllBytes(source.toPath()));
    }

    @Test public void recursiveManifestAndMissingChild() throws Exception {
        File source = temporary.newFolder("source", "nested");
        File destination = temporary.newFolder("destination", "nested");
        Files.write(new File(source, "keep.bin").toPath(), new byte[] {0, 1, 2});
        Files.write(new File(destination, "keep.bin").toPath(), new byte[] {0, 1, 2});
        FsVerification.compare(source.getParentFile(), destination.getParentFile());
        Files.delete(new File(destination, "keep.bin").toPath());
        assertThrows(IOException.class, () -> FsVerification.compare(source.getParentFile(), destination.getParentFile()));
    }

    @Test public void unsupportedProviderAndMissingDirectoryAreNotEmptySuccess() throws Exception {
        assertThrows(IOException.class, () -> FsVerification.path("content://provider/tree/test"));
        assertThrows(IOException.class, () -> FsVerification.list(new File(temporary.getRoot(), "missing")));
    }

    @Test public void canonicalAliasesAndSymbolicTrees() throws Exception {
        File target = temporary.newFolder("target");
        File link = new File(temporary.getRoot(), "alias");
        Files.createSymbolicLink(link.toPath(), target.toPath());
        assertEquals(target.getCanonicalFile(), FsVerification.path(link.getAbsolutePath()));
        assertThrows(IOException.class, () -> FsVerification.checkTree(link));
        File source = temporary.newFolder("tree");
        Files.createSymbolicLink(new File(source, "outside").toPath(), target.toPath());
        assertThrows(IOException.class, () -> FsVerification.checkTree(source));
    }
}
