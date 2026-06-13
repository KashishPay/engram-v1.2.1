package com.engram.app.glance

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.Button
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

class StreakWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val prefs: SharedPreferences = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val streak = prefs.getString("widget_data_streak", "0") ?: "0"

        provideContent {
            GlanceContent(streak)
        }
    }

    @Composable
    private fun GlanceContent(streak: String) {
        Column(
            modifier = GlanceModifier.fillMaxSize()
                .background(ColorProvider(Color.WHITE))
                .padding(16.dp),
            horizontalAlignment = Alignment.Horizontal.CenterHorizontally
        ) {
            Text(
                text = "Current Streak",
                style = TextStyle(fontWeight = FontWeight.Bold)
            )
            Text(
                text = "$streak days \uD83D\uDD25",
                style = TextStyle(fontWeight = FontWeight.Bold)
            )
            Spacer(modifier = GlanceModifier.height(16.dp))
            Button("Open App", onClick = actionRunCallback(OpenAppAction::class.java))
        }
    }
}
