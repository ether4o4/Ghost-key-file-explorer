package com.ghostkey.explorer.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ghostkey.explorer.theme.LocalLauncherTheme

// The NeverSoft four-pane logo — the launcher's Start emblem.
@Composable
fun StartLogo(logoSize: Dp, modifier: Modifier = Modifier) {
    Canvas(modifier.size(logoSize)) {
        val gap = size.width * 0.09f
        val pane = (size.width - gap) / 2f
        val brush = Brush.linearGradient(
            listOf(Color(0xFF3FBCF5), Color(0xFF0E6ECF)),
            start = Offset.Zero,
            end = Offset(size.width, size.height),
        )
        val positions = listOf(
            Offset(0f, 0f),
            Offset(pane + gap, 0f),
            Offset(0f, pane + gap),
            Offset(pane + gap, pane + gap),
        )
        positions.forEach { p ->
            drawRect(brush, topLeft = p, size = Size(pane, pane))
        }
    }
}

// Win11 filled accent button
@Composable
fun AccentButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val theme = LocalLauncherTheme.current
    Box(
        modifier
            .clip(RoundedCornerShape(4.dp))
            .background(if (enabled) theme.accent else theme.textDisabled.copy(alpha = 0.2f))
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = 20.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            color = if (enabled) theme.accentText else theme.textDisabled,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

// Win11 subtle (grey card) button
@Composable
fun SubtleButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val theme = LocalLauncherTheme.current
    Box(
        modifier
            .clip(RoundedCornerShape(4.dp))
            .background(theme.card)
            .border(1.dp, theme.stroke, RoundedCornerShape(4.dp))
            .clickable { onClick() }
            .padding(horizontal = 20.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = theme.text, fontSize = 14.sp)
    }
}
