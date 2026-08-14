package com.saku.umkm

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

object SakuColors {
    val BrandPrimary = Color(0xFF0D9860)
    val BrandPressed = Color(0xFF08734A)
    val BrandSoft = Color(0xFFE9F8F0)
    val SurfaceBase = Color(0xFFF6F8F7)
    val SurfaceRaised = Color(0xFFFFFFFF)
    val SurfaceSubtle = Color(0xFFF0F4F2)
    val TextPrimary = Color(0xFF17221C)
    val TextSecondary = Color(0xFF4E6057)
    val TextMuted = Color(0xFF718078)
    val BorderSubtle = Color(0xFFE3EBE6)
    val BorderStrong = Color(0xFFC9D8D0)
    val Success = Color(0xFF0D9860)
    val Warning = Color(0xFFAA6C0E)
    val Danger = Color(0xFFCA3E46)
}

private val Light = lightColorScheme(
    primary = SakuColors.BrandPrimary,
    onPrimary = Color.White,
    primaryContainer = SakuColors.BrandSoft,
    onPrimaryContainer = Color(0xFF075638),
    background = SakuColors.SurfaceBase,
    onBackground = SakuColors.TextPrimary,
    surface = SakuColors.SurfaceRaised,
    onSurface = SakuColors.TextPrimary,
    surfaceVariant = SakuColors.SurfaceSubtle,
    onSurfaceVariant = SakuColors.TextSecondary,
    outline = SakuColors.BorderStrong,
    error = SakuColors.Danger
)

private val Dark = darkColorScheme(
    primary = Color(0xFF23E58A),
    onPrimary = Color(0xFF032B1C),
    primaryContainer = Color(0xFF0A4B33),
    onPrimaryContainer = Color(0xFFB7F5D5),
    background = Color(0xFF0C1210),
    onBackground = Color(0xFFF0F7F3),
    surface = Color(0xFF121B17),
    onSurface = Color(0xFFF0F7F3),
    surfaceVariant = Color(0xFF19251F),
    onSurfaceVariant = Color(0xFFB7C7BE),
    outline = Color(0xFF3C5046),
    error = Color(0xFFFF8B93)
)

@Composable
fun SakuTheme(darkTheme: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (darkTheme) Dark else Light, content = content)
}
