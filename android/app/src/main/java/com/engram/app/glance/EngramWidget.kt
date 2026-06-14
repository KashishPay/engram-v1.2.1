package com.engram.app.glance

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.Button
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.ActionParameters
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.layout.height
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

class EngramWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // Read data directly from CapacitorStorage
        val prefs: SharedPreferences = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val dueCount = prefs.getString("widget_data_due", "0") ?: "0"
        val streak = prefs.getString("widget_data_streak", "0") ?: "0"
        val progress = prefs.getString("widget_data_progress", "0") ?: "0"
        
        provideContent {
            GlanceContent(dueCount, streak, progress)
        }
    }

    @Composable
    private fun GlanceContent(dueCount: String, streak: String, progress: String) {
        Column(
            modifier = GlanceModifier.fillMaxSize()
                .background(ColorProvider(Color.WHITE))
                .padding(16.dp),
            horizontalAlignment = Alignment.Horizontal.CenterHorizontally
        ) {
            Text(
                text = "Engram Dashboard",
                style = TextStyle(fontWeight = FontWeight.Bold)
            )

            Row(modifier = GlanceModifier.padding(top = 16.dp).fillMaxWidth(), horizontalAlignment = Alignment.Horizontal.CenterHorizontally) {
                Column(horizontalAlignment = Alignment.Horizontal.CenterHorizontally) {
                    Text(text = dueCount, style = TextStyle(fontWeight = FontWeight.Bold))
                    Text(text = "Due")
                    Button("Review", onClick = actionRunCallback(StartReviewAction::class.java))
                }
                Spacer(modifier = GlanceModifier.width(8.dp))
                Column(horizontalAlignment = Alignment.Horizontal.CenterHorizontally) {
                    Text(text = streak, style = TextStyle(fontWeight = FontWeight.Bold))
                    Text(text = "Streak")
                    Button("View", onClick = actionRunCallback(OpenAppAction::class.java))
                }
                Spacer(modifier = GlanceModifier.width(8.dp))
                Column(horizontalAlignment = Alignment.Horizontal.CenterHorizontally, modifier = GlanceModifier.clickable(onClick = actionRunCallback(OpenAppAction::class.java))) {
                    Text(text = progress, style = TextStyle(fontWeight = FontWeight.Bold))
                    Text(text = "Progress")
                }
            }
            Spacer(modifier = GlanceModifier.height(16.dp))
            Row(modifier = GlanceModifier.fillMaxWidth(), horizontalAlignment = Alignment.Horizontal.CenterHorizontally) {
                Button("Start Focus", onClick = actionRunCallback(StartTimerAction::class.java))
                Spacer(modifier = GlanceModifier.width(8.dp))
                Button("+ Task", onClick = actionRunCallback(AddTaskAction::class.java))
            }
        }
    }
}

class StartTimerAction : ActionCallback {
    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: ActionParameters
    ) {
        val serviceIntent = Intent(context, com.engram.app.OverlayTimerService::class.java).apply {
            action = "START"
            putExtra("type", "pomodoro")
            putExtra("title", "Focus Timer")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }
        
        // Also send an UPDATE to start the native countdown immediately (25 mins default)
        val updateIntent = Intent(context, com.engram.app.OverlayTimerService::class.java).apply {
            action = "UPDATE"
            putExtra("time", 25 * 60)
        }
        context.startService(updateIntent)

        // Save flag to CapacitorStorage
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        prefs.edit().putString("widget_action_start_timer", System.currentTimeMillis().toString()).apply()
        
        EngramWidget().updateAll(context)
        FocusWidget().updateAll(context)
        ReviewWidget().updateAll(context)
        StreakWidget().updateAll(context)
    }
}

class StartReviewAction : ActionCallback {
    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: ActionParameters
    ) {
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        prefs.edit().putString("widget_action_start_review", System.currentTimeMillis().toString()).apply()
        launchApp(context)
    }
}

class AddTaskAction : ActionCallback {
    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: ActionParameters
    ) {
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        prefs.edit().putString("widget_action_add_task", System.currentTimeMillis().toString()).apply()
        launchApp(context)
    }
}

class OpenAppAction : ActionCallback {
    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: ActionParameters
    ) {
        launchApp(context)
    }
}

fun launchApp(context: Context) {
    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
    if (launchIntent != null) {
        launchIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        context.startActivity(launchIntent)
    }
}
