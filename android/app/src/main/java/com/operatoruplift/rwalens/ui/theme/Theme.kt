package com.operatoruplift.rwalens.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

private val DarkColorScheme = darkColorScheme(
    primary = Citron,
    onPrimary = Ink,
    secondary = Ivory,
    onSecondary = Ink,
    tertiary = Green,
    onTertiary = Ivory,
    background = Ink,
    onBackground = Ivory,
    surface = InkRaised,
    onSurface = Ivory,
    surfaceVariant = InkRaised,
    onSurfaceVariant = MutedOnInk,
)

private val LightColorScheme = lightColorScheme(
    primary = Ink,
    onPrimary = Ivory,
    secondary = Green,
    onSecondary = Ivory,
    tertiary = Citron,
    onTertiary = Ink,
    background = Ivory,
    onBackground = Ink,
    surface = Paper,
    onSurface = Ink,
    surfaceVariant = Sunken,
    onSurfaceVariant = Muted,
)

@Composable
fun WebShellTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    // The shell frames the RWA Lens website, so it keeps the brand palette
    // instead of the wallpaper-derived dynamic colours of Android 12+.
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }

        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
