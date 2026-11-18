package com.ghostkey.explorer.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.ghostkey.explorer.theme.LocalLauncherTheme

// Windows 11 context menu: acrylic surface, 8dp corners, icon + label rows.
@Composable
fun Win11Menu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    offset: DpOffset = DpOffset(0.dp, 0.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    val theme = LocalLauncherTheme.current
    DropdownMenu(
        expanded = expanded,
        onDismissRequest = onDismiss,
        offset = offset,
        shape = RoundedCornerShape(8.dp),
        containerColor = theme.menuSurface,
        content = content,
    )
}

@Composable
fun MenuRow(
    icon: ImageVector?,
    label: String,
    enabled: Boolean = true,
    checked: Boolean? = null,
    submenu: Boolean = false,
    danger: Boolean = false,
    onClick: () -> Unit,
) {
    val theme = LocalLauncherTheme.current
    val color = when {
        !enabled -> theme.textDisabled
        danger -> Color(0xFFFF6B6B)
        else -> theme.text
    }
    Row(
        Modifier
            .width(232.dp)
            .padding(horizontal = 4.dp)
            .clip(RoundedCornerShape(4.dp))
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(18.dp), contentAlignment = Alignment.Center) {
            when {
                checked == true -> Icon(Icons.Outlined.Check, null, Modifier.size(16.dp), tint = theme.accent)
                icon != null -> Icon(icon, null, Modifier.size(16.dp), tint = if (enabled && !danger) theme.textSecondary else color)
            }
        }
        Spacer(Modifier.width(12.dp))
        Text(label, color = color, fontSize = 13.sp, modifier = Modifier.weight(1f), maxLines = 1)
        if (submenu) Icon(Icons.Outlined.ChevronRight, null, Modifier.size(14.dp), tint = theme.textSecondary)
    }
}

@Composable
fun MenuDivider() {
    val theme = LocalLauncherTheme.current
    Box(Modifier.width(232.dp).padding(vertical = 4.dp).height(1.dp).background(theme.divider))
}

@Composable
fun MenuHeader(text: String) {
    val theme = LocalLauncherTheme.current
    Text(
        text, color = theme.textSecondary, fontSize = 11.sp,
        modifier = Modifier.width(232.dp).padding(horizontal = 14.dp, vertical = 6.dp),
    )
}

/** Win11 content dialog: title, body slot, accent + subtle buttons. */
@Composable
fun Win11Dialog(
    title: String,
    onDismiss: () -> Unit,
    primary: String? = null,
    primaryEnabled: Boolean = true,
    onPrimary: () -> Unit = {},
    secondary: String = "Cancel",
    content: @Composable ColumnScope.() -> Unit,
) {
    val theme = LocalLauncherTheme.current
    Dialog(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .width(320.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(theme.windowSurface)
                .border(1.dp, theme.stroke, RoundedCornerShape(8.dp))
                .padding(20.dp),
        ) {
            Text(title, color = theme.text, fontSize = 16.sp)
            Spacer(Modifier.height(12.dp))
            content()
            Spacer(Modifier.height(16.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (primary != null) {
                    AccentButton(primary, onClick = onPrimary, enabled = primaryEnabled, modifier = Modifier.weight(1f))
                }
                SubtleButton(secondary, onClick = onDismiss, modifier = Modifier.weight(1f))
            }
        }
    }
}

/** NeverSoft-style text box (input field background, 1px stroke). */
@Composable
fun Win11TextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    password: Boolean = false,
    autoFocus: Boolean = false,
) {
    val theme = LocalLauncherTheme.current
    val focus = remember { FocusRequester() }
    Box(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(4.dp))
            .background(theme.inputField)
            .border(1.dp, theme.stroke, RoundedCornerShape(4.dp))
            .padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        if (value.isEmpty() && placeholder.isNotEmpty()) {
            Text(placeholder, color = theme.textDisabled, fontSize = 13.sp)
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = TextStyle(color = theme.text, fontSize = 13.sp),
            cursorBrush = SolidColor(theme.accent),
            visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
            modifier = Modifier.fillMaxWidth().focusRequester(focus),
        )
    }
    if (autoFocus) LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
}

/** Text-prompt dialog (rename, new name, password…). */
@Composable
fun PromptDialog(
    title: String,
    initial: String,
    confirm: String = "OK",
    password: Boolean = false,
    message: String? = null,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var text by remember { mutableStateOf(initial) }
    val theme = LocalLauncherTheme.current
    Win11Dialog(
        title = title,
        onDismiss = onDismiss,
        primary = confirm,
        primaryEnabled = text.isNotBlank(),
        onPrimary = { onConfirm(text); onDismiss() },
    ) {
        if (message != null) {
            Text(message, color = theme.textSecondary, fontSize = 12.sp)
            Spacer(Modifier.height(10.dp))
        }
        Win11TextField(text, { text = it }, password = password, autoFocus = true)
    }
}

/** Yes/no confirmation. */
@Composable
fun ConfirmDialog(
    title: String,
    message: String,
    confirm: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val theme = LocalLauncherTheme.current
    Win11Dialog(title = title, onDismiss = onDismiss, primary = confirm, onPrimary = { onConfirm(); onDismiss() }) {
        Text(message, color = theme.textSecondary, fontSize = 13.sp)
    }
}
