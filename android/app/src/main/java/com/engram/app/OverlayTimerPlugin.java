package com.engram.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OverlayTimer")
public class OverlayTimerPlugin extends Plugin {

    @PluginMethod
    public void startTimer(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(getContext())) {
            // Need permission
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.reject("Missing SYSTEM_ALERT_WINDOW permission");
            return;
        }

        String type = call.getString("type", "pomodoro");
        String title = call.getString("title", "Focus Timer");

        Intent serviceIntent = new Intent(getContext(), OverlayTimerService.class);
        serviceIntent.setAction("START");
        serviceIntent.putExtra("type", type);
        serviceIntent.putExtra("title", title);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(serviceIntent);
        } else {
            getContext().startService(serviceIntent);
        }

        call.resolve();
    }

    @PluginMethod
    public void stopTimer(PluginCall call) {
        Intent serviceIntent = new Intent(getContext(), OverlayTimerService.class);
        serviceIntent.setAction("STOP");
        getContext().startService(serviceIntent);
        call.resolve();
    }

    @PluginMethod
    public void updateTimer(PluginCall call) {
        int time = call.getInt("time", 0);
        Intent serviceIntent = new Intent(getContext(), OverlayTimerService.class);
        serviceIntent.setAction("UPDATE");
        serviceIntent.putExtra("time", time);
        getContext().startService(serviceIntent);
        call.resolve();
    }
}
