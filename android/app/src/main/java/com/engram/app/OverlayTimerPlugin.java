package com.engram.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OverlayTimer")
public class OverlayTimerPlugin extends Plugin {

    private BroadcastReceiver stateReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String state = intent.getStringExtra("state");
            android.util.Log.d("OverlayTimerPlugin", "Broadcast received, state: " + state);
            JSObject ret = new JSObject();
            ret.put("state", state);
            notifyListeners("timerStateChanged", ret);
        }
    };

    @Override
    public void load() {
        super.load();
        IntentFilter filter = new IntentFilter("com.engram.app.TIMER_STATE_CHANGED");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(stateReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(stateReceiver, filter);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (stateReceiver != null) {
            try {
                getContext().unregisterReceiver(stateReceiver);
            } catch (Exception e) {}
        }
        super.handleOnDestroy();
    }

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
        String themeColor = call.getString("themeColor", "blue");

        Intent serviceIntent = new Intent(getContext(), OverlayTimerService.class);
        serviceIntent.setAction("START");
        serviceIntent.putExtra("type", type);
        serviceIntent.putExtra("title", title);
        serviceIntent.putExtra("themeColor", themeColor);

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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(serviceIntent);
        } else {
            getContext().startService(serviceIntent);
        }
        call.resolve();
    }

    @PluginMethod
    public void updateTimer(PluginCall call) {
        int time = call.getInt("time", 0);
        boolean isRunning = call.getBoolean("isRunning", false);
        String themeColor = call.getString("themeColor", "blue");
        
        Intent serviceIntent = new Intent(getContext(), OverlayTimerService.class);
        serviceIntent.setAction("UPDATE");
        serviceIntent.putExtra("time", time);
        serviceIntent.putExtra("isRunning", isRunning);
        serviceIntent.putExtra("themeColor", themeColor);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(serviceIntent);
        } else {
            getContext().startService(serviceIntent);
        }
        call.resolve();
    }

    @PluginMethod
    public void updateWidgets(PluginCall call) {
        try {
            com.engram.app.glance.WidgetUpdater.updateAllWidgets(getContext());
        } catch (Exception e) {
            e.printStackTrace();
        }
        call.resolve();
    }
}
