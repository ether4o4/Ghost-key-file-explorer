package com.ghostkey.explorer.windows

import android.os.Environment
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ghostkey.explorer.data.Settings
import com.ghostkey.explorer.explorer.FsEvents
import com.ghostkey.explorer.explorer.formatSize
import com.ghostkey.explorer.files.FileOpener
import com.ghostkey.explorer.intel.Analyzer
import com.ghostkey.explorer.intel.FileIndex
import com.ghostkey.explorer.intel.Limbo
import com.ghostkey.explorer.intel.Tag
import com.ghostkey.explorer.intel.Tagger
import com.ghostkey.explorer.intel.Timeline
import com.ghostkey.explorer.intel.VaultEntry
import com.ghostkey.explorer.intel.Vaults
import com.ghostkey.explorer.shell.LocalShellActions
import com.ghostkey.explorer.theme.LauncherThemes
import com.ghostkey.explorer.theme.LocalLauncherTheme
import com.ghostkey.explorer.ui.AccentButton
import com.ghostkey.explorer.ui.ConfirmDialog
import com.ghostkey.explorer.ui.PromptDialog
import com.ghostkey.explorer.ui.SubtleButton
import com.ghostkey.explorer.ui.Toasts
import com.ghostkey.explorer.ui.Win11Dialog
import com.ghostkey.explorer.ui.Win11TextField
import com.ghostkey.explorer.window.ShellWindow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// ————————————————————————— Shared pieces —————————————————————————

@Composable
internal fun SectionTitle(text: String) {
    val theme = LocalLauncherTheme.current
    Text(text, color = theme.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 10.dp, bottom = 6.dp))
}

@Composable
internal fun Card(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val theme = LocalLauncherTheme.current
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(theme.card)
            .border(1.dp, theme.stroke, RoundedCornerShape(6.dp)).padding(12.dp),
        content = content,
    )
}

@Composable
internal fun Chip(text: String, selected: Boolean = false, color: Color? = null, onClick: (() -> Unit)? = null) {
    val theme = LocalLauncherTheme.current
    Row(
        Modifier.clip(RoundedCornerShape(12.dp))
            .background(if (selected) theme.accent.copy(alpha = 0.25f) else theme.card)
            .border(1.dp, if (selected) theme.accent else theme.stroke, RoundedCornerShape(12.dp))
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (color != null) { Box(Modifier.size(7.dp).clip(CircleShape).background(color)); Spacer(Modifier.width(6.dp)) }
        Text(text, color = theme.text, fontSize = 11.sp, maxLines = 1)
    }
}

@Composable
private fun ToolBar(content: @Composable RowScope.() -> Unit) {
    val theme = LocalLauncherTheme.current
    Row(
        Modifier.fillMaxWidth().height(44.dp).horizontalScroll(rememberScrollState()).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
    Box(Modifier.fillMaxWidth().height(1.dp).background(theme.divider))
}

@Composable
private fun ToolText(icon: ImageVector, label: String, enabled: Boolean = true, tint: Color? = null, onClick: () -> Unit) {
    val theme = LocalLauncherTheme.current
    Row(
        Modifier.clip(RoundedCornerShape(4.dp)).clickable(enabled = enabled) { onClick() }.padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(16.dp), tint = if (enabled) tint ?: theme.accent else theme.textDisabled)
        Spacer(Modifier.width(6.dp))
        Text(label, color = if (enabled) theme.text else theme.textDisabled, fontSize = 13.sp)
    }
}

private fun stamp(ts: Long) = SimpleDateFormat("MMM d, yyyy h:mm a", Locale.getDefault()).format(Date(ts))

// ————————————————————————— Timeline —————————————————————————

@Composable
fun TimelineWindow(window: ShellWindow) {
    val theme = LocalLauncherTheme.current
    val actions = LocalShellActions.current
    var group by remember { mutableStateOf("All") }
    var confirmClear by remember { mutableStateOf(false) }
    val types = Timeline.GROUPS[group].orEmpty()
    val events = Timeline.events.filter { types.isEmpty() || it.type in types }
    val spikes = remember(events.size) { Timeline.spikeDays(events) }
    val byDay = events.groupBy { Timeline.dayKey(it.timestamp) }

    Column(Modifier.fillMaxSize()) {
        ToolBar {
            Timeline.GROUPS.keys.forEach { g ->
                Chip(g, selected = g == group) { group = g }
                Spacer(Modifier.width(6.dp))
            }
            Spacer(Modifier.width(8.dp))
            ToolText(Icons.Outlined.DeleteSweep, "Clear", enabled = Timeline.events.isNotEmpty()) { confirmClear = true }
        }
        if (events.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Nothing recorded yet. Every move, copy, tag, vault and Limbo action shows up here.", color = theme.textSecondary, fontSize = 12.sp, modifier = Modifier.padding(24.dp))
            }
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
                byDay.forEach { (day, list) ->
                    item(key = "h$day") {
                        Row(Modifier.padding(top = 12.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                runCatching { SimpleDateFormat("EEEE, MMM d", Locale.getDefault()).format(SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).parse(day)!!) }.getOrDefault(day),
                                color = theme.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.width(8.dp))
                            Text("${list.size} events", color = theme.textSecondary, fontSize = 11.sp)
                            if (day in spikes) { Spacer(Modifier.width(8.dp)); Chip("Activity spike", color = Color(0xFFFF6B35)) }
                        }
                    }
                    items(list, key = { "${it.timestamp}-${it.type}-${it.description.hashCode()}" }) { ev ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp))
                                .clickable(enabled = ev.path != null) {
                                    val f = File(ev.path!!)
                                    if (f.exists()) actions.openExplorer(if (f.isDirectory) f.absolutePath else f.parent) else Toasts.show("That item no longer exists")
                                }
                                .padding(vertical = 6.dp, horizontal = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(Modifier.size(8.dp).clip(CircleShape).background(Color(Timeline.color(ev.type))))
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(ev.description, color = theme.text, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text(ev.type.replace('_', ' '), color = theme.textSecondary, fontSize = 10.sp)
                            }
                            Text(Timeline.relativeTime(ev.timestamp), color = theme.textSecondary, fontSize = 10.sp)
                        }
                    }
                }
            }
        }
    }
    if (confirmClear) ConfirmDialog("Clear timeline?", "This removes every recorded event.", "Clear", onConfirm = { Timeline.clear() }, onDismiss = { confirmClear = false })
}

// ————————————————————————— Vaults —————————————————————————

private sealed interface VaultPrompt {
    data object Create : VaultPrompt
    data class Unlock(val id: String) : VaultPrompt
    data class Wipe(val id: String) : VaultPrompt
}

@Composable
fun VaultsWindow(window: ShellWindow) {
    val theme = LocalLauncherTheme.current
    val scope = rememberCoroutineScope()
    val pendingAdd = window.param?.let { File(it) }?.takeIf { it.isFile }
    var prompt by remember { mutableStateOf<VaultPrompt?>(null) }
    var busy by remember { mutableStateOf(false) }
    var expanded by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize()) {
        ToolBar {
            ToolText(Icons.Outlined.Add, "New vault") { prompt = VaultPrompt.Create }
            ToolText(Icons.Outlined.LockClock, "Lock all", enabled = Vaults.vaults.any { Vaults.isUnlocked(it.id) }) { Vaults.lockAll() }
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp)) {
            if (pendingAdd != null) {
                Card {
                    Text("Add \"${pendingAdd.name}\" to a vault", color = theme.text, fontSize = 13.sp)
                    Text("Unlock a vault below, then tap Seal here. The original goes to the Recycle Bin after the encrypted copy verifies (forensic vaults keep it).", color = theme.textSecondary, fontSize = 11.sp)
                }
                Spacer(Modifier.height(10.dp))
            }
            if (Vaults.vaults.isEmpty()) {
                Text("No vaults yet. A vault is a password-protected, AES-256 encrypted container. Even the file names inside are encrypted.", color = theme.textSecondary, fontSize = 12.sp)
            }
            Vaults.vaults.forEach { v ->
                val unlocked = Vaults.isUnlocked(v.id)
                val typeColor = when (v.type) { "forensic" -> Color(0xFFFFD700); "ephemeral" -> Color(0xFFFF3355); else -> Color(0xFF6C63FF) }
                Card(Modifier.padding(bottom = 10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (unlocked) Icons.Outlined.LockOpen else Icons.Outlined.Lock, null, Modifier.size(20.dp), tint = typeColor)
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(v.name, color = theme.text, fontSize = 14.sp)
                            Text(
                                v.type.replaceFirstChar { it.uppercase() } + " · created " + stamp(v.createdAt) +
                                    (v.wipeAt?.let { " · wipes " + Timeline.relativeTime(2 * System.currentTimeMillis() - it).replace(" ago", "") + " from now" } ?: ""),
                                color = theme.textSecondary, fontSize = 10.sp,
                            )
                        }
                        if (unlocked) SubtleButton("Lock", onClick = { Vaults.lock(v.id) })
                        else AccentButton("Unlock", onClick = { prompt = VaultPrompt.Unlock(v.id) })
                    }
                    if (unlocked) {
                        val entries = Vaults.contents[v.id].orEmpty()
                        Spacer(Modifier.height(10.dp))
                        if (pendingAdd != null) {
                            AccentButton(if (busy) "Sealing…" else "Seal \"${pendingAdd.name}\" here", enabled = !busy, modifier = Modifier.fillMaxWidth(), onClick = {
                                busy = true
                                scope.launch {
                                    withContext(Dispatchers.IO) { runCatching { Vaults.addFile(v.id, pendingAdd, removeOriginal = true) } }
                                        .onSuccess { FsEvents.changed(); Toasts.success("Sealed \"${it.name}\" (verified)") }
                                        .onFailure { Toasts.error(it.message ?: "Couldn't seal the file") }
                                    busy = false
                                }
                            })
                            Spacer(Modifier.height(8.dp))
                        }
                        if (entries.isEmpty()) Text("Empty. Use \"Add to vault\" on any file in File Explorer.", color = theme.textSecondary, fontSize = 11.sp)
                        entries.forEach { e -> VaultEntryRow(v.id, v.type, e) }
                        if (v.type == "forensic") {
                            Spacer(Modifier.height(6.dp))
                            Text(
                                if (expanded == v.id) "Hide chain of custody" else "Show chain of custody",
                                color = theme.accent, fontSize = 11.sp,
                                modifier = Modifier.clickable { expanded = if (expanded == v.id) null else v.id }.padding(vertical = 4.dp),
                            )
                            if (expanded == v.id) Vaults.custody[v.id].orEmpty().forEach {
                                Text(it, color = theme.textSecondary, fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Text("Wipe vault", color = Color(0xFFFF6B6B), fontSize = 11.sp, modifier = Modifier.clickable { prompt = VaultPrompt.Wipe(v.id) }.padding(vertical = 4.dp))
                    }
                }
            }
        }
    }

    when (val p = prompt) {
        VaultPrompt.Create -> CreateVaultDialog { prompt = null }
        is VaultPrompt.Unlock -> PromptDialog(
            title = "Unlock vault", initial = "", confirm = "Unlock", password = true,
            onConfirm = { pw ->
                scope.launch {
                    val ok = withContext(Dispatchers.IO) { Vaults.unlock(p.id, pw.toCharArray()) }
                    if (!ok) Toasts.error("Wrong password")
                }
            },
            onDismiss = { prompt = null },
        )
        is VaultPrompt.Wipe -> ConfirmDialog(
            "Wipe this vault?", "Everything sealed inside is destroyed permanently. This can't be undone.", "Wipe",
            onConfirm = { Vaults.wipe(p.id) }, onDismiss = { prompt = null },
        )
        null -> Unit
    }
}

@Composable
private fun VaultEntryRow(vaultId: String, type: String, e: VaultEntry) {
    val theme = LocalLauncherTheme.current
    val scope = rememberCoroutineScope()
    val dl = remember { Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS) }
    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Outlined.EnhancedEncryption, null, Modifier.size(16.dp), tint = theme.textSecondary)
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Text(e.name, color = theme.text, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${formatSize(e.size)} · sha256 ${e.sha256.take(12)}…", color = theme.textSecondary, fontSize = 10.sp)
        }
        Text(
            "Extract", color = theme.accent, fontSize = 11.sp,
            modifier = Modifier.clip(RoundedCornerShape(4.dp)).clickable {
                scope.launch {
                    withContext(Dispatchers.IO) { runCatching { Vaults.extract(vaultId, e, dl) } }
                        .onSuccess { FsEvents.changed(); Toasts.success("Extracted to Downloads/${it.name}") }
                        .onFailure { Toasts.error(it.message ?: "Extract failed") }
                }
            }.padding(6.dp),
        )
        if (type != "forensic") {
            Icon(
                Icons.Outlined.Close, "Remove", Modifier.size(28.dp).clip(RoundedCornerShape(4.dp))
                    .clickable { runCatching { Vaults.removeEntry(vaultId, e) }.onFailure { Toasts.error(it.message ?: "") } }.padding(6.dp),
                tint = theme.textSecondary,
            )
        }
    }
}

@Composable
private fun CreateVaultDialog(onDismiss: () -> Unit) {
    val theme = LocalLauncherTheme.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("standard") }
    var pw by remember { mutableStateOf("") }
    var pw2 by remember { mutableStateOf("") }
    Win11Dialog(
        title = "New vault", onDismiss = onDismiss, primary = "Create",
        primaryEnabled = pw.length >= 4 && pw == pw2,
        onPrimary = {
            scope.launch {
                withContext(Dispatchers.IO) { runCatching { Vaults.create(name.ifBlank { "Vault" }, type, pw.toCharArray()) } }
                    .onSuccess { Toasts.success("Vault \"${it.name}\" created") }
                    .onFailure { Toasts.error(it.message ?: "Couldn't create vault") }
            }
            onDismiss()
        },
    ) {
        Win11TextField(name, { name = it }, placeholder = "Name")
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("standard", "forensic", "ephemeral").forEach { t -> Chip(t.replaceFirstChar { it.uppercase() }, selected = type == t) { type = t } }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            when (type) {
                "forensic" -> "Evidence mode: originals are never removed; SHA-256 and chain of custody are kept."
                "ephemeral" -> "Wipes itself automatically 24 hours after creation."
                else -> "General encrypted storage."
            },
            color = theme.textSecondary, fontSize = 11.sp,
        )
        Spacer(Modifier.height(10.dp))
        Win11TextField(pw, { pw = it }, placeholder = "Password (4+ characters)", password = true)
        Spacer(Modifier.height(8.dp))
        Win11TextField(pw2, { pw2 = it }, placeholder = "Confirm password", password = true)
        Spacer(Modifier.height(6.dp))
        Text("There's no password recovery. A forgotten password means the vault can't be opened.", color = Color(0xFFFFB347), fontSize = 10.sp)
    }
}

// ————————————————————————— Limbo —————————————————————————

@Composable
fun LimboWindow(window: ShellWindow) {
    val theme = LocalLauncherTheme.current
    val actions = LocalShellActions.current
    val scope = rememberCoroutineScope()
    val ws = Limbo.workspace
    var busy by remember { mutableStateOf(false) }
    var placeName by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize()) {
        ToolBar {
            ToolText(Icons.Outlined.FolderOpen, "Browse workspace", enabled = ws != null) { ws?.let { actions.openExplorer(it.dir.absolutePath, newWindow = true) } }
            ToolText(Icons.Outlined.Biotech, if (busy) "Analyzing…" else "Analyze", enabled = ws != null && !busy) {
                busy = true
                scope.launch { withContext(Dispatchers.IO) { Limbo.analyze() }; busy = false }
            }
            ToolText(Icons.Outlined.Inventory2, "Repackage to Downloads", enabled = ws != null) { placeName = ws?.archiveName }
            ToolText(Icons.Outlined.DeleteOutline, "Discard", enabled = ws != null, tint = Color(0xFFFF6B6B)) { Limbo.discard(); FsEvents.changed() }
        }
        if (ws == null) {
            Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Outlined.Science, null, Modifier.size(40.dp), tint = Color(0xFFFF6B35))
                Spacer(Modifier.height(10.dp))
                Text("Limbo is empty", color = theme.text, fontSize = 14.sp)
                Spacer(Modifier.height(6.dp))
                Text(
                    "Long-press a .zip in File Explorer → Open in Limbo. It's extracted into an isolated workspace " +
                        "(path-escape, zip-bomb and size checks), where you can inspect and edit it. Nothing touches your folders until you repackage, and the rebuilt ZIP is verified first.",
                    color = theme.textSecondary, fontSize = 12.sp,
                )
            }
        } else {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp)) {
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.FolderZip, null, Modifier.size(22.dp), tint = Color(0xFFFF6B35))
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(ws.archiveName, color = theme.text, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${ws.fileCount} files · ${formatSize(ws.totalBytes)} · isolated", color = theme.textSecondary, fontSize = 11.sp)
                        }
                        Chip(
                            ws.status.uppercase(),
                            color = when (ws.status) { "flagged" -> Color(0xFFFF3355); "clean" -> Color(0xFF00C853); else -> Color(0xFF64748B) },
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Text("Tip: drag files out of the workspace window into your folders to release just those.", color = theme.textSecondary, fontSize = 10.sp)
                }
                ws.findings?.let { f ->
                    SectionTitle("Findings")
                    Card { EntityLists(f.phones, f.emails, f.urls, f.domains, f.dates, f.keywords) }
                }
                SectionTitle("Contents")
                Card {
                    ws.entries.filter { !it.isDir }.take(200).forEach {
                        Row(Modifier.padding(vertical = 2.dp)) {
                            Text(it.path, color = theme.text, fontSize = 11.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(formatSize(it.size), color = theme.textSecondary, fontSize = 10.sp)
                        }
                    }
                    if (ws.fileCount > 200) Text("+${ws.fileCount - 200} more", color = theme.textSecondary, fontSize = 10.sp)
                }
                SectionTitle("Log")
                Card { ws.log.forEach { Text(it, color = theme.textSecondary, fontSize = 10.sp, fontFamily = FontFamily.Monospace) } }
            }
        }
    }
    placeName?.let { initial ->
        PromptDialog(
            title = "Repackage & place", initial = initial, confirm = "Place",
            message = "Saved into Downloads after the rebuilt ZIP verifies. To place it elsewhere, use \"Repackage & place here\" in any explorer folder.",
            onConfirm = { name ->
                scope.launch {
                    val dl = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    withContext(Dispatchers.IO) { runCatching { Limbo.repackagePlace(dl, name) } }
                        .onSuccess { FsEvents.changed(); Toasts.success("Placed Downloads/${it.name} (verified)") }
                        .onFailure { Toasts.error(it.message ?: "Repackage failed — archive not placed") }
                }
            },
            onDismiss = { placeName = null },
        )
    }
}

@Composable
private fun EntityLists(phones: List<String>, emails: List<String>, urls: List<String>, domains: List<String>, dates: List<String>, keywords: List<String>) {
    val theme = LocalLauncherTheme.current
    @Composable
    fun group(label: String, values: List<String>) {
        if (values.isEmpty()) return
        Text("$label (${values.size})", color = theme.textSecondary, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp, bottom = 3.dp))
        FlowRowCompat(values.take(20)) { Chip(it) }
    }
    if (listOf(phones, emails, urls, domains, dates, keywords).all { it.isEmpty() }) {
        Text("No phone numbers, emails, links or other entities found.", color = theme.textSecondary, fontSize = 11.sp)
    }
    group("Phones", phones); group("Emails", emails); group("Links", urls)
    group("Platforms", domains); group("Dates", dates); group("Keywords", keywords)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun <T> FlowRowCompat(values: List<T>, item: @Composable (T) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        values.forEach { item(it) }
    }
}

// ————————————————————————— Properties & tags (Inspector) —————————————————————————

@Composable
fun InspectorWindow(window: ShellWindow) {
    val theme = LocalLauncherTheme.current
    val context = LocalContext.current
    val actions = LocalShellActions.current
    val scope = rememberCoroutineScope()
    val path = window.param ?: return
    val file = remember(path) { File(path) }
    LaunchedEffect(path) {
        actions.setWindowTitle(window.id, "${file.name} Properties")
        withContext(Dispatchers.IO) { if (file.exists()) FileIndex.ensure(file) }
    }
    val rec = FileIndex.records[path]
    var addTag by remember { mutableStateOf(false) }
    var linking by remember { mutableStateOf(false) }
    var analyzing by remember { mutableStateOf(false) }

    if (!file.exists()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("This file no longer exists", color = theme.textSecondary, fontSize = 13.sp) }
        return
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(if (file.isDirectory) Icons.Outlined.Folder else Icons.Outlined.Description, null, Modifier.size(32.dp), tint = if (file.isDirectory) Color(0xFFFFCA28) else theme.textSecondary)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(file.name, color = theme.text, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(rec?.sku ?: "Indexing…", color = theme.accent, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
            }
        }
        SectionTitle("General")
        Card {
            PropRow("Location", file.parent ?: "")
            PropRow("Size", if (file.isDirectory) "${file.listFiles()?.size ?: 0} items" else formatSize(file.length()))
            PropRow("Modified", stamp(file.lastModified()))
            if (file.isFile) PropRow("Type", com.ghostkey.explorer.files.FileOpener.mimeOf(file))
        }
        if (rec != null) {
            SectionTitle("Tags")
            Card {
                Tagger.DIMENSIONS.forEach { dim ->
                    val tags = rec.tags.filter { it.dimension == dim }
                    Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
                        Text(dim.replaceFirstChar { it.uppercase() }, color = theme.textSecondary, fontSize = 11.sp, modifier = Modifier.width(52.dp).padding(top = 4.dp))
                        if (tags.isEmpty()) Text("—", color = theme.textDisabled, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
                        else FlowRowCompat(tags) { t -> Chip(t.value + if (t.confidence < 1.0) " ·${(t.confidence * 100).toInt()}%" else "") { FileIndex.removeTag(path, t) } }
                    }
                }
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SubtleButton("Add tag", onClick = { addTag = true })
                    SubtleButton(if (rec.flagged) "Unflag" else "Flag", onClick = { FileIndex.update(path) { it.copy(flagged = !it.flagged) } })
                }
                Text("Tap a tag to remove it.", color = theme.textDisabled, fontSize = 10.sp, modifier = Modifier.padding(top = 6.dp))
            }

            SectionTitle("Linked files (SKU magnetism)")
            Card {
                val cluster = FileIndex.cluster(rec.sku).filter { it.path != path }
                if (cluster.isEmpty()) Text("Not linked to anything yet.", color = theme.textSecondary, fontSize = 11.sp)
                cluster.forEach { c ->
                    Row(
                        Modifier.fillMaxWidth().clickable { actions.openInspector(c.path) }.padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(c.sku, color = theme.accent, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                        Spacer(Modifier.width(8.dp))
                        Text(File(c.path).name, color = theme.text, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (c.sku in rec.links) Icon(Icons.Outlined.LinkOff, "Unlink", Modifier.size(24.dp).clickable { FileIndex.unlink(rec.sku, c.sku) }.padding(4.dp), tint = theme.textSecondary)
                    }
                }
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SubtleButton("Link…", onClick = { linking = true })
                    SubtleButton("Magnetize", onClick = {
                        val n = FileIndex.magnetize(path)
                        Toasts.show(if (n == 0) "No indexed files share a who/where tag" else "Linked $n related file(s)")
                    })
                }
            }

            SectionTitle("Analysis")
            Card {
                val a = rec.analysis
                if (a == null) Text("Extracts people, phone numbers, emails, links, platforms and risk indicators from the file.", color = theme.textSecondary, fontSize = 11.sp)
                else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Chip("Risk ${a.riskLabel} · ${"%.1f".format(a.riskScore)}", color = Color(a.riskColor))
                        Spacer(Modifier.width(8.dp))
                        Text(Timeline.relativeTime(a.analyzedAt), color = theme.textSecondary, fontSize = 10.sp)
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(a.summary, color = theme.text, fontSize = 12.sp)
                    a.patterns.forEach { Text("• $it", color = theme.textSecondary, fontSize = 11.sp) }
                    EntityLists(a.phones, a.emails, a.urls, a.domains, a.dates, a.keywords)
                }
                Spacer(Modifier.height(8.dp))
                AccentButton(if (analyzing) "Analyzing…" else if (a == null) "Analyze" else "Re-analyze", enabled = !analyzing && file.isFile, onClick = {
                    analyzing = true
                    scope.launch {
                        val result = withContext(Dispatchers.IO) { Analyzer.analyze(file, rec.tags) }
                        FileIndex.update(path) { it.copy(analysis = result) }
                        Timeline.record("file_analyzed", "Analyzed \"${file.name}\": risk ${result.riskLabel}", path, rec.sku)
                        analyzing = false
                    }
                })
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (file.isFile) SubtleButton("Open", onClick = { FileOpener.open(context, file) })
            SubtleButton("Show in folder", onClick = { actions.openExplorer(file.parent) })
            SubtleButton("Forget", onClick = { FileIndex.forget(path); actions.closeWindow(window.id) })
        }
    }

    if (addTag) AddTagDialog(onAdd = { FileIndex.addTag(path, it) }, onDismiss = { addTag = false })
    if (linking && rec != null) LinkDialog(rec.sku, onDismiss = { linking = false })
}

@Composable
private fun PropRow(label: String, value: String) {
    val theme = LocalLauncherTheme.current
    Row(Modifier.padding(vertical = 3.dp)) {
        Text(label, color = theme.textSecondary, fontSize = 11.sp, modifier = Modifier.width(70.dp))
        Text(value, color = theme.text, fontSize = 11.sp, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun AddTagDialog(onAdd: (Tag) -> Unit, onDismiss: () -> Unit) {
    var dim by remember { mutableStateOf("who") }
    var value by remember { mutableStateOf("") }
    Win11Dialog("Add tag", onDismiss, primary = "Add", primaryEnabled = value.isNotBlank(), onPrimary = { onAdd(Tag(dim, value.trim())); onDismiss() }) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { Tagger.DIMENSIONS.forEach { d -> Chip(d, selected = dim == d) { dim = d } } }
        Spacer(Modifier.height(10.dp))
        Win11TextField(value, { value = it }, placeholder = "Value", autoFocus = true)
    }
}

@Composable
private fun LinkDialog(sku: String, onDismiss: () -> Unit) {
    val theme = LocalLauncherTheme.current
    var q by remember { mutableStateOf("") }
    val candidates = FileIndex.records.values.filter { it.sku != sku }
        .filter { q.isBlank() || File(it.path).name.contains(q, true) || it.sku.contains(q, true) }
        .sortedBy { File(it.path).name.lowercase() }.take(50)
    Win11Dialog("Link to another file", onDismiss) {
        Win11TextField(q, { q = it }, placeholder = "Search indexed files or SKU")
        Spacer(Modifier.height(8.dp))
        if (candidates.isEmpty()) Text("Only files you've opened in Properties can be linked.", color = theme.textSecondary, fontSize = 11.sp)
        LazyColumn(Modifier.heightIn(max = 260.dp)) {
            items(candidates, key = { it.path }) { c ->
                Row(Modifier.fillMaxWidth().clickable { FileIndex.link(sku, c.sku); onDismiss() }.padding(vertical = 7.dp)) {
                    Text(c.sku, color = theme.accent, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                    Spacer(Modifier.width(8.dp))
                    Text(File(c.path).name, color = theme.text, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

// ————————————————————————— Settings —————————————————————————

@Composable
fun SettingsWindow(window: ShellWindow) {
    val theme = LocalLauncherTheme.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp)) {
        Text("Personalization", color = theme.text, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        SectionTitle("Theme")
        FlowRowCompat(LauncherThemes.all) { t ->
            Column(
                Modifier.width(92.dp).clip(RoundedCornerShape(6.dp))
                    .border(2.dp, if (t.preset == Settings.themePreset) theme.accent else theme.stroke, RoundedCornerShape(6.dp))
                    .clickable { Settings.updateTheme(t.preset) },
            ) {
                Box(Modifier.fillMaxWidth().height(52.dp).background(t.windowSurface)) {
                    Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(12.dp).background(t.taskbar))
                    Box(Modifier.align(Alignment.Center).size(22.dp, 6.dp).clip(RoundedCornerShape(3.dp)).background(t.accent))
                }
                Text(t.displayName, color = theme.text, fontSize = 11.sp, modifier = Modifier.padding(6.dp))
            }
        }
        SectionTitle("File Explorer")
        Card {
            ToggleRow("Open new windows in dual pane (wide screens)", Settings.dualPaneDefault) { Settings.updateDualPaneDefault(it) }
            ToggleRow("Show hidden items", Settings.showHidden) { Settings.updateShowHidden(it) }
            ToggleRow("Drag & drop copies instead of moving", Settings.dragCopies) { Settings.updateDragCopies(it) }
        }
        SectionTitle("Home screen widgets")
        Card {
            Text(
                "Each app folder can go on your home screen as a widget: open the folder and tap \"Add to home screen\", or long-press " +
                    "your home screen → Widgets → Ghost Key and choose a folder. Place as many as you like. Long-press a placed widget to switch its folder.",
                color = theme.textSecondary, fontSize = 12.sp,
            )
        }
        SectionTitle("About")
        Card {
            Text("Ghost Key File Explorer", color = theme.text, fontSize = 13.sp)
            Text("Windows 11 explorer from NeverSoft 11 + Ghost Key's dual-pane engine, tags, SKUs, timeline, vaults and Limbo. Everything stays on this device.", color = theme.textSecondary, fontSize = 11.sp)
        }
    }
}

@Composable
private fun ToggleRow(label: String, value: Boolean, onChange: (Boolean) -> Unit) {
    val theme = LocalLauncherTheme.current
    Row(Modifier.fillMaxWidth().clickable { onChange(!value) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = theme.text, fontSize = 12.sp, modifier = Modifier.weight(1f))
        // Win11 toggle switch
        Box(
            Modifier.size(40.dp, 20.dp).clip(RoundedCornerShape(10.dp))
                .background(if (value) theme.accent else Color.Transparent)
                .border(1.dp, if (value) theme.accent else theme.textSecondary, RoundedCornerShape(10.dp)),
            contentAlignment = if (value) Alignment.CenterEnd else Alignment.CenterStart,
        ) {
            Box(Modifier.padding(horizontal = 4.dp).size(12.dp).clip(CircleShape).background(if (value) theme.accentText else theme.textSecondary))
        }
    }
}
