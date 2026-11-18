package com.ghostkey.explorer.intel

import android.content.Context
import android.util.Base64
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import com.ghostkey.explorer.files.Trash
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import javax.crypto.SecretKey

// Ghost Key vaults: password-protected, AES-256-GCM encrypted containers in
// app-private storage. Even the list of files inside is encrypted.
//  - Standard:  general encrypted storage.
//  - Forensic:  evidence mode — originals are never removed, every item keeps
//               its SHA-256 and a chain-of-custody log.
//  - Ephemeral: wipes itself 24 hours after creation.
data class VaultInfo(
    val id: String,
    val name: String,
    val type: String, // standard | forensic | ephemeral
    val createdAt: Long,
    val wipeAt: Long?,
)

data class VaultEntry(
    val id: String,
    val name: String,
    val originalPath: String,
    val size: Long,
    val sha256: String,
    val addedAt: Long,
)

object Vaults {
    private lateinit var root: File
    val vaults = mutableStateListOf<VaultInfo>()
    private val keys = mutableStateMapOf<String, SecretKey>() // unlocked vaults only
    val contents = mutableStateMapOf<String, List<VaultEntry>>()
    val custody = mutableStateMapOf<String, List<String>>()

    fun init(context: Context) {
        root = File(context.filesDir, "vaults").apply { mkdirs() }
        reload()
        wipeExpired()
    }

    private fun dir(id: String) = File(root, id)

    private fun reload() {
        vaults.clear()
        root.listFiles().orEmpty().filter { it.isDirectory }.mapNotNull { d ->
            runCatching {
                val o = JSONObject(File(d, "vault.json").readText())
                VaultInfo(o.getString("id"), o.getString("name"), o.getString("type"), o.getLong("createdAt"),
                    if (o.has("wipeAt")) o.getLong("wipeAt") else null)
            }.getOrNull()
        }.sortedByDescending { it.createdAt }.forEach { vaults += it }
    }

    fun isUnlocked(id: String) = keys.containsKey(id)

    fun wipeExpired() {
        val now = System.currentTimeMillis()
        vaults.filter { it.wipeAt != null && it.wipeAt < now }.forEach { wipe(it.id, auto = true) }
    }

    fun create(name: String, type: String, password: CharArray): VaultInfo {
        require(password.size >= 4) { "Use a password of at least 4 characters" }
        val id = "v_" + java.util.UUID.randomUUID().toString().replace("-", "").take(16)
        val d = dir(id).apply { mkdirs() }
        val salt = VaultCrypto.randomBytes(32)
        val key = VaultCrypto.deriveKey(password, salt)
        val created = System.currentTimeMillis()
        val wipeAt = if (type == "ephemeral") created + 24 * 3600_000L else null
        val header = JSONObject().put("id", id).put("name", name.ifBlank { "Vault" }).put("type", type)
            .put("createdAt", created).put("iterations", VaultCrypto.ITERATIONS)
            .put("salt", Base64.encodeToString(salt, Base64.NO_WRAP))
            .put("check", Base64.encodeToString(VaultCrypto.encryptBytes(key, "ghostkey-vault".toByteArray()), Base64.NO_WRAP))
            .apply { wipeAt?.let { put("wipeAt", it) } }
        File(d, "vault.json").writeText(header.toString())
        keys[id] = key
        contents[id] = emptyList()
        custody[id] = listOf("${stamp()} Vault created ($type)")
        writeManifest(id)
        reload()
        Timeline.record("vault_created", "Vault \"${header.getString("name")}\" created ($type)")
        return vaults.first { it.id == id }
    }

    fun unlock(id: String, password: CharArray): Boolean {
        val d = dir(id)
        val header = runCatching { JSONObject(File(d, "vault.json").readText()) }.getOrNull() ?: return false
        val key = VaultCrypto.deriveKey(password, Base64.decode(header.getString("salt"), Base64.NO_WRAP), header.getInt("iterations"))
        val ok = runCatching {
            String(VaultCrypto.decryptBytes(key, Base64.decode(header.getString("check"), Base64.NO_WRAP))) == "ghostkey-vault"
        }.getOrDefault(false)
        if (!ok) return false
        keys[id] = key
        readManifest(id)
        Timeline.record("vault_unlocked", "Vault \"${header.getString("name")}\" unlocked")
        return true
    }

    fun lock(id: String) {
        keys.remove(id)
        contents.remove(id)
        custody.remove(id)
        Timeline.record("vault_locked", "Vault \"${vaults.firstOrNull { it.id == id }?.name}\" locked")
    }

    fun lockAll() = keys.keys.toList().forEach { lock(it) }

    private fun readManifest(id: String) {
        val key = keys[id] ?: return
        val f = File(dir(id), "manifest.gk")
        val o = if (f.exists()) JSONObject(String(VaultCrypto.decryptBytes(key, f.readBytes()))) else JSONObject()
        val arr = o.optJSONArray("entries") ?: JSONArray()
        contents[id] = List(arr.length()) {
            val e = arr.getJSONObject(it)
            VaultEntry(e.getString("id"), e.getString("name"), e.getString("orig"), e.getLong("size"), e.getString("sha"), e.getLong("added"))
        }
        val log = o.optJSONArray("custody") ?: JSONArray()
        custody[id] = List(log.length()) { log.getString(it) }
    }

    private fun writeManifest(id: String) {
        val key = keys[id] ?: return
        val arr = JSONArray()
        contents[id].orEmpty().forEach {
            arr.put(JSONObject().put("id", it.id).put("name", it.name).put("orig", it.originalPath)
                .put("size", it.size).put("sha", it.sha256).put("added", it.addedAt))
        }
        val o = JSONObject().put("entries", arr).put("custody", JSONArray(custody[id].orEmpty()))
        val tmp = File(dir(id), "manifest.gk.tmp")
        tmp.writeBytes(VaultCrypto.encryptBytes(key, o.toString().toByteArray()))
        tmp.renameTo(File(dir(id), "manifest.gk"))
    }

    private fun stamp() = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.ROOT).format(java.util.Date())

    private fun sha256(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(1 shl 16)
            while (true) { val n = input.read(buf); if (n < 0) break; md.update(buf, 0, n) }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    /**
     * Seal a file into a vault. The encrypted copy is decrypted again and its
     * SHA-256 compared before anything else happens; only then, if
     * [removeOriginal] is set (never for forensic vaults), the original goes
     * to the Recycle Bin so it can still be recovered.
     */
    fun addFile(id: String, file: File, removeOriginal: Boolean): VaultEntry {
        val key = keys[id] ?: error("Unlock the vault first")
        require(file.isFile) { "Only files can go into a vault" }
        val info = vaults.first { it.id == id }
        val entryId = "e_" + java.util.UUID.randomUUID().toString().replace("-", "")
        val out = File(dir(id), "$entryId.gk")
        val hash = sha256(file)
        file.inputStream().buffered().use { input -> out.outputStream().buffered().use { VaultCrypto.encrypt(key, input, it) } }
        // Verify the sealed copy round-trips exactly
        val md = MessageDigest.getInstance("SHA-256")
        out.inputStream().buffered().use { input ->
            VaultCrypto.decrypt(key, input, object : java.io.OutputStream() {
                override fun write(b: Int) = md.update(b.toByte())
                override fun write(b: ByteArray, off: Int, len: Int) = md.update(b, off, len)
            })
        }
        val check = md.digest().joinToString("") { "%02x".format(it) }
        if (check != hash) { out.delete(); error("Encryption verification failed; original left untouched") }
        val entry = VaultEntry(entryId, file.name, file.absolutePath, file.length(), hash, System.currentTimeMillis())
        contents[id] = contents[id].orEmpty() + entry
        custody[id] = custody[id].orEmpty() + "${stamp()} Added ${file.name} sha256=$hash from ${file.absolutePath}"
        writeManifest(id)
        if (removeOriginal && info.type != "forensic") Trash.moveToTrash(file)
        Timeline.record("vault_added", "Sealed \"${file.name}\" into vault \"${info.name}\"", file.absolutePath)
        return entry
    }

    /** Decrypt an entry back out to [destDir]; returns the written file. */
    fun extract(id: String, entry: VaultEntry, destDir: File): File {
        val key = keys[id] ?: error("Unlock the vault first")
        val target = Trash.uniqueName(destDir, entry.name)
        val tmp = File(destDir, ".${target.name}.gkpart")
        try {
            File(dir(id), "${entry.id}.gk").inputStream().buffered().use { input ->
                tmp.outputStream().buffered().use { VaultCrypto.decrypt(key, input, it) }
            }
            if (sha256(tmp) != entry.sha256) error("Integrity check failed")
            if (!tmp.renameTo(target)) error("Could not write ${target.name}")
        } finally {
            tmp.delete()
        }
        custody[id] = custody[id].orEmpty() + "${stamp()} Extracted ${entry.name} to ${target.absolutePath}"
        writeManifest(id)
        Timeline.record("vault_extracted", "Extracted \"${entry.name}\" from vault", target.absolutePath)
        return target
    }

    fun removeEntry(id: String, entry: VaultEntry) {
        val info = vaults.first { it.id == id }
        require(info.type != "forensic") { "Forensic vaults never delete evidence" }
        File(dir(id), "${entry.id}.gk").delete()
        contents[id] = contents[id].orEmpty().filterNot { it.id == entry.id }
        custody[id] = custody[id].orEmpty() + "${stamp()} Removed ${entry.name}"
        writeManifest(id)
    }

    fun wipe(id: String, auto: Boolean = false) {
        val name = vaults.firstOrNull { it.id == id }?.name
        keys.remove(id); contents.remove(id); custody.remove(id)
        dir(id).deleteRecursively()
        reload()
        Timeline.record("vault_wiped", if (auto) "Ephemeral vault \"$name\" auto-wiped" else "Vault \"$name\" wiped")
    }
}
