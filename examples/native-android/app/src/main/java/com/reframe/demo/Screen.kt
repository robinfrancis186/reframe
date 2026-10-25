package com.reframe.demo
import androidx.compose.runtime.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.*

import androidx.compose.runtime.Composable
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
@Composable fun Screen() {
    Column {
        Text("Your native workspace")
    
ReframeNativeCommunity()

    ReframeNativeInterests()
  }
}


@Composable
fun ReframeNativeInterests() {
val primary = MaterialTheme.colorScheme.primary
val background = MaterialTheme.colorScheme.background
val ink = MaterialTheme.colorScheme.onSurface
var checked by remember { mutableStateOf(setOf("Design")) }
MaterialTheme(colorScheme=MaterialTheme.colorScheme.copy(primary=primary,onPrimary=MaterialTheme.colorScheme.onPrimary,background=background,surface=background,onSurface=ink)) {
CompositionLocalProvider(LocalTextStyle provides MaterialTheme.typography.bodyMedium.copy(fontFamily=MaterialTheme.typography.bodyMedium.fontFamily)) {
Surface(color=background,contentColor=ink,shape=RoundedCornerShape(12.dp)) { Column(Modifier.fillMaxWidth().padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
val choices = listOf("Design", "Engineering", "Research")
choices.forEach { value -> Row(verticalAlignment=Alignment.CenterVertically) { Checkbox(checked=checked.contains(value),onCheckedChange={ enabled -> checked = if(enabled) checked + value else checked - value }); Text(value) } }
Text("${checked.size} selected")
} } } }
}
