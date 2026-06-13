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

class FocusWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            GlanceContent()
        }
    }

    @Composable
    private fun GlanceContent() {
        Column(
            modifier = GlanceModifier.fillMaxSize()
                .background(ColorProvider(Color.WHITE))
                .padding(16.dp),
            horizontalAlignment = Alignment.Horizontal.CenterHorizontally
        ) {
            Text(
                text = "Focus Timer",
                style = TextStyle(fontWeight = FontWeight.Bold)
            )
            Spacer(modifier = GlanceModifier.height(16.dp))
            Button("Start Pomodoro (25m)", onClick = actionRunCallback(StartTimerAction::class.java))
        }
    }
}
