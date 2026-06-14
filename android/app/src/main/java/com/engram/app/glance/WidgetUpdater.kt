package com.engram.app.glance

import android.content.Context
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

object WidgetUpdater {
    @JvmStatic
    fun updateAllWidgets(context: Context) {
        GlobalScope.launch {
            try {
                EngramWidget().updateAll(context)
                FocusWidget().updateAll(context)
                ReviewWidget().updateAll(context)
                StreakWidget().updateAll(context)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
