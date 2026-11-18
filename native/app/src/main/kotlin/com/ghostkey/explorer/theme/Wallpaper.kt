package com.ghostkey.explorer.theme

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import kotlin.math.min

// The desktop backdrop: NeverSoft 11's procedural recreation of the
// Windows 11 "Bloom" wallpaper, tinted by the active theme's accent.
@Composable
fun BloomWallpaper(
    isDark: Boolean,
    accent: Color = Color(0xFF4CC2FF),
    modifier: Modifier = Modifier,
) {
    val base = if (isDark) blendColor(accent, Color.Black, 0.86f)
    else blendColor(accent, Color.White, 0.52f)
    Canvas(modifier.background(base)) { drawBloom(isDark, accent) }
}

internal fun blendColor(base: Color, other: Color, t: Float): Color = Color(
    red = base.red + (other.red - base.red) * t,
    green = base.green + (other.green - base.green) * t,
    blue = base.blue + (other.blue - base.blue) * t,
    alpha = 1f,
)

private fun DrawScope.drawBloom(isDark: Boolean, accent: Color) {
    val bgTop = if (isDark) blendColor(accent, Color.Black, 0.90f) else blendColor(accent, Color.White, 0.62f)
    val bgMid = if (isDark) blendColor(accent, Color.Black, 0.82f) else blendColor(accent, Color.White, 0.46f)
    val bgBot = if (isDark) blendColor(accent, Color.Black, 0.70f) else blendColor(accent, Color.White, 0.30f)
    drawRect(Brush.verticalGradient(listOf(bgTop, bgMid, bgBot)))

    val cx = size.width * 0.5f
    val cy = size.height * 0.52f
    val r = min(size.width, size.height) * 0.62f
    val center = Offset(cx, cy)

    val glow = if (isDark) blendColor(accent, Color.White, 0.15f) else Color.White
    drawCircle(
        Brush.radialGradient(
            listOf(glow.copy(alpha = if (isDark) 0.35f else 0.40f), glow.copy(alpha = 0.18f), Color.Transparent),
            center = center, radius = r * 1.5f,
        ),
        radius = r * 1.5f, center = center,
    )

    val bright = blendColor(accent, Color.White, if (isDark) 0.40f else 0.72f)
    val deep = blendColor(accent, if (isDark) Color.Black else Color.White, if (isDark) 0.25f else 0.30f)
    val petalColors = listOf(
        accent.copy(alpha = 0.70f), bright.copy(alpha = 0.55f), deep.copy(alpha = 0.65f),
        bright.copy(alpha = 0.55f), accent.copy(alpha = 0.72f), bright.copy(alpha = 0.55f),
        deep.copy(alpha = 0.65f), bright.copy(alpha = 0.55f),
    )
    petalColors.forEachIndexed { i, color ->
        rotate(degrees = i * 45f + 12f, pivot = center) {
            val petalW = r * 0.62f
            val petalH = r * 1.28f
            drawOval(
                Brush.radialGradient(
                    listOf(color, color.copy(alpha = color.alpha * 0.35f), Color.Transparent),
                    center = Offset(cx, cy - petalH * 0.42f),
                    radius = petalH * 0.72f,
                ),
                topLeft = Offset(cx - petalW / 2f, cy - petalH),
                size = Size(petalW, petalH),
            )
        }
    }

    val core = if (isDark) blendColor(accent, Color.White, 0.65f) else Color.White
    drawCircle(
        Brush.radialGradient(
            listOf(core.copy(alpha = 0.90f), accent.copy(alpha = 0.50f), Color.Transparent),
            center = center, radius = r * 0.34f,
        ),
        radius = r * 0.34f, center = center,
    )

    if (isDark) {
        drawRect(
            Brush.verticalGradient(
                0f to Color(0x66000000), 0.25f to Color.Transparent,
                0.75f to Color.Transparent, 1f to Color(0x73000000),
            ),
        )
    }
}
