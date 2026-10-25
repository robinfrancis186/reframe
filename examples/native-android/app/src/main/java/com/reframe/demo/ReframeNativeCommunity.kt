package com.reframe.demo

import androidx.compose.runtime.Composable
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.viewinterop.AndroidView

@Composable fun ReframeNativeCommunity(apiBase: String = "http://10.0.2.2:5176") {
    val colors = MaterialTheme.colorScheme
    AndroidView(factory = { context -> ReframeNativeCommunityView(context, apiBase) }, update = { it.applyTheme(colors.primary.toArgb(), colors.onSurface.toArgb(), colors.onPrimary.toArgb()) })
}
