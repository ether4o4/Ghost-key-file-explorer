package com.ghostkey.explorer

import com.ghostkey.explorer.intel.VaultCrypto
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import kotlin.random.Random

class VaultCryptoTest {
    private val key = VaultCrypto.deriveKey("correct horse".toCharArray(), ByteArray(32) { it.toByte() }, 1000)

    private fun seal(data: ByteArray) = VaultCrypto.encryptBytes(key, data)

    @Test fun roundTripsEverySizeAroundChunkBoundaries() {
        val c = VaultCrypto.CHUNK
        for (size in listOf(0, 1, 15, c - 1, c, c + 1, 2 * c, 3 * c + c / 2)) {
            val data = Random(size).nextBytes(size)
            assertArrayEquals("size $size", data, VaultCrypto.decryptBytes(key, seal(data)))
        }
    }

    @Test fun wrongKeyFails() {
        val other = VaultCrypto.deriveKey("wrong".toCharArray(), ByteArray(32) { it.toByte() }, 1000)
        val sealed = seal("secret".toByteArray())
        assertThrows(Exception::class.java) { VaultCrypto.decryptBytes(other, sealed) }
    }

    @Test fun flippedByteFails() {
        val sealed = seal(Random(1).nextBytes(5000))
        sealed[sealed.size / 2] = (sealed[sealed.size / 2].toInt() xor 1).toByte()
        assertThrows(Exception::class.java) { VaultCrypto.decryptBytes(key, sealed) }
    }

    /** Split a sealed blob into header + chunks so tests can tamper with structure. */
    private fun chunks(sealed: ByteArray): Pair<ByteArray, List<ByteArray>> {
        val input = DataInputStream(sealed.inputStream())
        val header = ByteArray(12).also { input.readFully(it) }
        val list = mutableListOf<ByteArray>()
        while (input.available() > 0) {
            val len = input.readInt()
            list += ByteArray(len).also { input.readFully(it) }
        }
        return header to list
    }

    private fun join(header: ByteArray, list: List<ByteArray>): ByteArray {
        val out = ByteArrayOutputStream()
        val d = DataOutputStream(out)
        d.write(header)
        list.forEach { d.writeInt(it.size); d.write(it) }
        return out.toByteArray()
    }

    @Test fun truncatingTheLastChunkFails() {
        val (header, list) = chunks(seal(Random(2).nextBytes(VaultCrypto.CHUNK * 2 + 10)))
        assertThrows(Exception::class.java) { VaultCrypto.decryptBytes(key, join(header, list.dropLast(1))) }
    }

    @Test fun reorderingChunksFails() {
        val (header, list) = chunks(seal(Random(3).nextBytes(VaultCrypto.CHUNK * 3)))
        val swapped = listOf(list[1], list[0]) + list.drop(2)
        assertThrows(Exception::class.java) { VaultCrypto.decryptBytes(key, join(header, swapped)) }
    }
}
