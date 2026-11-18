package com.ghostkey.explorer.explorer

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

// Grid-view image thumbnails, decoded off the main thread at low resolution.
object Thumbnails {
    private val cache = LruCache<String, ImageBitmap>(120)

    fun decode(file: File, target: Int = 192): ImageBitmap? {
        val key = "${file.absolutePath}:${file.lastModified()}"
        cache.get(key)?.let { return it }
        return runCatching {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.absolutePath, bounds)
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= target && bounds.outHeight / (sample * 2) >= target) sample *= 2
            BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
                ?.asImageBitmap()
        }.getOrNull()?.also { cache.put(key, it) }
    }
}

@Composable
fun Thumbnail(file: File, modifier: Modifier, fallback: @Composable () -> Unit) {
    var bmp by remember(file.absolutePath) { mutableStateOf<ImageBitmap?>(null) }
    LaunchedEffect(file.absolutePath, file.lastModified()) {
        bmp = withContext(Dispatchers.IO) { Thumbnails.decode(file) }
    }
    val b = bmp
    if (b != null) Image(b, null, modifier, contentScale = ContentScale.Crop) else fallback()
}
