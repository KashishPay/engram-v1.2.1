package com.engram.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;

import androidx.core.app.NotificationCompat;

public class OverlayTimerService extends Service {

    private boolean isViewAttached = false;
    private WindowManager windowManager;
    private android.widget.FrameLayout floatingView;
    private android.webkit.WebView overlayWebView;
    private String currentType = "pomodoro";
    private String currentTitle = "Focus Timer";

    private WindowManager.LayoutParams params;

    private int currentTimeInSeconds = -1;
    private boolean isRunning = false;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private void updateUIText() {
        if (overlayWebView != null && currentTimeInSeconds >= 0) {
            int minutes = currentTimeInSeconds / 60;
            int seconds = currentTimeInSeconds % 60;
            String timeStr = String.format("%02d:%02d", minutes, seconds);
            String titleStr = currentTitle;
            String typeStr = currentType;
            final String js = String.format("javascript:updateOverlay('%s', '%s', '%s', %b)", timeStr, titleStr, typeStr, isRunning);
            handler.post(() -> {
                overlayWebView.evaluateJavascript(js, null);
            });
        }
    }

    private void notifyApp(String state) {
        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        prefs.edit().putString("timer_state", state).apply();
        
        Intent bcast = new Intent("com.engram.app.TIMER_STATE_CHANGED");
        bcast.putExtra("state", state);
        sendBroadcast(bcast);
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        android.util.Log.d("OverlayTimerService", "Overlay service started");
        createNotificationChannel();
        Notification notification = new NotificationCompat.Builder(this, "OVERLAY_CHANNEL")
                .setContentTitle("Pomodoro Timer")
                .setContentText("Overlay is active")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .build();
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(1, notification);
        }
        
        initOverlay();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    "OVERLAY_CHANNEL",
                    "Overlay Timer Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void initOverlay() {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        
        android.widget.FrameLayout layout = new android.widget.FrameLayout(this) {
            private int initialX;
            private int initialY;
            private float initialTouchX;
            private float initialTouchY;
            private boolean isDragging = false;

            @Override
            public boolean onInterceptTouchEvent(MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = params.x;
                        initialY = params.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        isDragging = false;
                        break;
                    case MotionEvent.ACTION_MOVE:
                        float diffX = Math.abs(event.getRawX() - initialTouchX);
                        float diffY = Math.abs(event.getRawY() - initialTouchY);
                        if (diffX > 10 || diffY > 10) {
                            isDragging = true;
                            return true;
                        }
                        break;
                }
                return super.onInterceptTouchEvent(event);
            }

            @Override
            public boolean onTouchEvent(MotionEvent event) {
                if (!isDragging) {
                    return super.onTouchEvent(event);
                }
                switch (event.getAction()) {
                    case MotionEvent.ACTION_MOVE:
                        params.x = initialX + (int) (event.getRawX() - initialTouchX);
                        params.y = initialY + (int) (event.getRawY() - initialTouchY);
                        windowManager.updateViewLayout(this, params);
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        isDragging = false;
                        return true;
                }
                return super.onTouchEvent(event);
            }
        };

        layout.setBackgroundColor(Color.TRANSPARENT);

        overlayWebView = new android.webkit.WebView(this);
        overlayWebView.getSettings().setJavaScriptEnabled(true);
        overlayWebView.getSettings().setDomStorageEnabled(true);
        overlayWebView.setBackgroundColor(Color.TRANSPARENT);
        overlayWebView.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void setCollapsed(boolean collapsed) {
                handler.post(() -> {
                    if (collapsed) {
                        int widthPx = (int) (140 * getResources().getDisplayMetrics().density);
                        int heightPx = (int) (55 * getResources().getDisplayMetrics().density);
                        overlayWebView.setLayoutParams(new android.widget.FrameLayout.LayoutParams(widthPx, heightPx));
                    } else {
                        int widthPx = (int) (320 * getResources().getDisplayMetrics().density);
                        int heightPx = (int) (80 * getResources().getDisplayMetrics().density);
                        overlayWebView.setLayoutParams(new android.widget.FrameLayout.LayoutParams(widthPx, heightPx));
                    }
                    windowManager.updateViewLayout(floatingView, params);
                });
            }

            @android.webkit.JavascriptInterface
            public void resetTimer() {
                notifyApp("reset");
            }
            @android.webkit.JavascriptInterface
            public void pauseTimer() {
                notifyApp("paused");
                isRunning = false;
                updateUIText();
            }
            @android.webkit.JavascriptInterface
            public void resumeTimer() {
                notifyApp("resumed");
                isRunning = true;
                updateUIText();
            }
            @android.webkit.JavascriptInterface
            public void stopTimer() {
                notifyApp("stopped");
            }
        }, "OverlayManager");
        overlayWebView.loadUrl("file:///android_asset/overlay.html");

        int widthPx = (int) (320 * getResources().getDisplayMetrics().density);
        int heightPx = (int) (80 * getResources().getDisplayMetrics().density);
        layout.addView(overlayWebView, new android.widget.FrameLayout.LayoutParams(widthPx, heightPx));

        floatingView = layout;

        int layoutFlag;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutFlag = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutFlag = WindowManager.LayoutParams.TYPE_PHONE;
        }

        params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutFlag,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
        );

        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 0;
        params.y = 100;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !android.provider.Settings.canDrawOverlays(this)) {
            android.util.Log.e("OverlayTimerService", "SYSTEM_ALERT_WINDOW permission not granted. Cannot draw overlay.");
            return;
        }

        windowManager.addView(floatingView, params);
        isViewAttached = true;
        android.util.Log.d("OverlayTimerService", "View attached to WindowManager");
        
        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String savedTime = prefs.getString("pomodoroTime", "");
        if (!savedTime.isEmpty()) {
            try {
                String[] parts = savedTime.split(":");
                currentTimeInSeconds = Integer.parseInt(parts[0]) * 60 + Integer.parseInt(parts[1]);
                updateUIText();
            } catch (Exception e) {}
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            android.util.Log.d("OverlayTimerService", "Received action: " + action);
            if ("START".equals(action)) {
                if (intent.hasExtra("type")) {
                    currentType = intent.getStringExtra("type");
                }
                if (intent.hasExtra("title")) {
                    currentTitle = intent.getStringExtra("title");
                }
                isRunning = true;
                updateUIText();
            } else if ("PAUSE".equals(action)) {
                isRunning = false;
                updateUIText();
            } else if ("RESUME".equals(action)) {
                isRunning = true;
                updateUIText();
            } else if ("STOP".equals(action)) {
                stopSelf();
                return START_NOT_STICKY;
            } else if ("UPDATE".equals(action)) {
                int time = intent.getIntExtra("time", 0);
                currentTimeInSeconds = time;
                updateUIText();
            }
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (floatingView != null && isViewAttached) {
            try {
                windowManager.removeView(floatingView);
                isViewAttached = false;
            } catch (Exception e) {}
        }
    }
}
