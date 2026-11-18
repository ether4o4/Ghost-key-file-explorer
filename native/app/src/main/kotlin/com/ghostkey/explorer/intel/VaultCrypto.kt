package com.ghostkey.explorer.intel

import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.EOFException
import java.io.InputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

// Streaming AES-256-GCM in independent 1 MiB chunks, so files of any size can
// be sealed without holding them in memory. Each chunk's nonce is a random
// 8-byte prefix plus the chunk index, and the index and a "final chunk" flag
// are authenticated, so chunks cannot be reordered, dropped or truncated.
//   "GKV1" | prefix(8) | { len:int32 | ciphertext+tag }*
object VaultCrypto {
    private val MAGIC = byteArrayOf('G'.code.toByte(), 'K'.code.toByte(), 'V'.code.toByte(), '1'.code.toByte())
    const val CHUNK = 1 shl 20
    const val ITERATIONS = 200_000
    private val random = SecureRandom()

    fun randomBytes(n: Int) = ByteArray(n).also { random.nextBytes(it) }

    fun deriveKey(password: CharArray, salt: ByteArray, iterations: Int = ITERATIONS): SecretKey {
        val spec = PBEKeySpec(password, salt, iterations, 256)
        try {
            val raw = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
            return SecretKeySpec(raw, "AES")
        } finally {
            spec.clearPassword()
        }
    }

    private fun nonce(prefix: ByteArray, index: Int) =
        ByteBuffer.allocate(12).put(prefix).putInt(index).array()

    private fun aad(index: Int, final: Boolean) =
        ByteBuffer.allocate(5).putInt(index).put(if (final) 1 else 0).array()

    private fun cipher(mode: Int, key: SecretKey, prefix: ByteArray, index: Int, final: Boolean): Cipher =
        Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(mode, key, GCMParameterSpec(128, nonce(prefix, index)))
            updateAAD(aad(index, final))
        }

    private fun readFully(input: InputStream, buf: ByteArray): Int {
        var n = 0
        while (n < buf.size) {
            val r = input.read(buf, n, buf.size - n)
            if (r < 0) break
            n += r
        }
        return n
    }

    fun encrypt(key: SecretKey, input: InputStream, output: OutputStream) {
        val out = DataOutputStream(output)
        val prefix = randomBytes(8)
        out.write(MAGIC)
        out.write(prefix)
        var index = 0
        var current = ByteArray(CHUNK)
        var currentLen = readFully(input, current)
        while (true) {
            val next = ByteArray(CHUNK)
            val nextLen = if (currentLen == CHUNK) readFully(input, next) else 0
            val final = nextLen == 0
            val ct = cipher(Cipher.ENCRYPT_MODE, key, prefix, index, final).doFinal(current, 0, currentLen)
            out.writeInt(ct.size)
            out.write(ct)
            if (final) break
            index++
            current = next
            currentLen = nextLen
        }
        out.flush()
    }

    fun decrypt(key: SecretKey, input: InputStream, output: OutputStream) {
        val inp = DataInputStream(input)
        val magic = ByteArray(4)
        inp.readFully(magic)
        require(magic.contentEquals(MAGIC)) { "Not a Ghost Key vault file" }
        val prefix = ByteArray(8)
        inp.readFully(prefix)
        var index = 0
        var len = inp.readInt()
        while (true) {
            require(len in 16..(CHUNK + 16)) { "Corrupt vault chunk" }
            val ct = ByteArray(len)
            inp.readFully(ct)
            val nextLen: Int? = try { inp.readInt() } catch (_: EOFException) { null }
            val final = nextLen == null
            output.write(cipher(Cipher.DECRYPT_MODE, key, prefix, index, final).doFinal(ct))
            if (final) break
            index++
            len = nextLen!!
        }
        output.flush()
    }

    fun encryptBytes(key: SecretKey, data: ByteArray): ByteArray =
        ByteArrayOutputStream().also { encrypt(key, data.inputStream(), it) }.toByteArray()

    fun decryptBytes(key: SecretKey, data: ByteArray): ByteArray =
        ByteArrayOutputStream().also { decrypt(key, data.inputStream(), it) }.toByteArray()
}
