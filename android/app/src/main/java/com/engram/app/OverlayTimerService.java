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
import android.view.ViewConfiguration;
import android.view.WindowManager;

import androidx.core.app.NotificationCompat;

public class OverlayTimerService extends Service {

    private boolean isViewAttached = false;
    private WindowManager windowManager;
    private android.widget.FrameLayout floatingView;
    private android.webkit.WebView overlayWebView;
    private String currentType = "pomodoro";
    private String currentTitle = "Focus Timer";
    private String currentTheme = "blue"; // default theme

    private WindowManager.LayoutParams params;

    private int currentTimeInSeconds = -1;
    private int initialSessionSeconds = 0;
    private boolean isRunning = false;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable timerRunnable;

    private int lastSentTime = -1;
    private boolean lastSentRunning = false;
    private String lastTheme = "";
    
    private boolean isPageReady = false;
    private JSInterface jsInterface;

    private class JSInterface {
        @android.webkit.JavascriptInterface
        public void setCollapsed(boolean collapsed) {
            android.util.Log.d("OverlayTimerService", "JS called setCollapsed: " + collapsed);
            handler.post(() -> {
                int widthPx, heightPx;
                if (collapsed) {
                    widthPx = (int) (140 * getResources().getDisplayMetrics().density);
                    heightPx = (int) (55 * getResources().getDisplayMetrics().density);
                } else {
                    widthPx = (int) (320 * getResources().getDisplayMetrics().density);
                    heightPx = (int) (80 * getResources().getDisplayMetrics().density);
                }
                overlayWebView.setLayoutParams(new android.widget.FrameLayout.LayoutParams(widthPx, heightPx));
                params.width = widthPx;
                params.height = heightPx;
                windowManager.updateViewLayout(floatingView, params);
            });
        }

        @android.webkit.JavascriptInterface
        public void resetTimer() {
            android.util.Log.d("OverlayTimerService", "JS called resetTimer");
            handler.post(() -> {
                currentTimeInSeconds = initialSessionSeconds;
                isRunning = false;
                updateUIText();
                notifyApp("reset");
            });
        }
        @android.webkit.JavascriptInterface
        public void pauseTimer() {
            android.util.Log.d("OverlayTimerService", "JS called pauseTimer");
            handler.post(() -> {
                isRunning = false;
                android.util.Log.d("OverlayTimerService", "Bypassing throttle for button-triggered update (pause)");
                updateUIText();
                notifyApp("paused");
            });
        }
        @android.webkit.JavascriptInterface
        public void resumeTimer() {
            android.util.Log.d("OverlayTimerService", "JS called resumeTimer");
            handler.post(() -> {
                if ("pomodoro".equals(currentType) && currentTimeInSeconds == 0) {
                    return;
                }
                isRunning = true;
                android.util.Log.d("OverlayTimerService", "Bypassing throttle for button-triggered update (resume)");
                updateUIText();
                notifyApp("resumed");
            });
        }
        @android.webkit.JavascriptInterface
        public void stopTimer() {
            android.util.Log.d("OverlayTimerService", "JS called stopTimer");
            handler.post(() -> {
                isRunning = false;
                updateUIText();
                notifyApp("stopped");
                stopSelf();
            });
        }
    }

    private void updateUIText() {
        if (!isRunning && currentTimeInSeconds == lastSentTime && currentTheme != null && currentTheme.equals(lastTheme) && !lastSentRunning) {
            android.util.Log.d("OverlayTimerService", "Skipped redundant paused updateUIText");
            return;
        }

        if (overlayWebView != null && isPageReady && currentTimeInSeconds >= 0) {
            int minutes = currentTimeInSeconds / 60;
            int seconds = currentTimeInSeconds % 60;
            String timeStr = String.format("%02d:%02d", minutes, seconds);
            String titleStr = currentTitle != null ? currentTitle : "";
            String typeStr = currentType != null ? currentType : "";
            
            String safeTitle = titleStr.replace("'", "\\'");
            String safeType = typeStr.replace("'", "\\'");
            String safeTheme = currentTheme != null ? currentTheme.replace("'", "\\'") : "";
            
            final String js = String.format("javascript:updateOverlay('%s', '%s', '%s', %b, '%s')", timeStr, safeTitle, safeType, isRunning, safeTheme);
            
            lastSentTime = currentTimeInSeconds;
            lastSentRunning = isRunning;
            lastTheme = currentTheme;
            
            handler.post(() -> {
                if (overlayWebView != null && isPageReady) {
                    try {
                        overlayWebView.evaluateJavascript(js, null);
                    } catch (Exception e) {
                        android.util.Log.e("OverlayTimerService", "JS evaluation failed", e);
                    }
                }
            });
        }
    }

    private void notifyApp(String state) {
        android.util.Log.d("OverlayTimerService", "notifyApp state: " + state);
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

        timerRunnable = new Runnable() {
            @Override
            public void run() {
                if (isRunning && currentTimeInSeconds >= 0) {
                    if ("pomodoro".equals(currentType)) {
                        if (currentTimeInSeconds > 0) {
                            currentTimeInSeconds--;
                        } else {
                            currentTimeInSeconds = 0;
                            isRunning = false;

                            updateUIText();

                            Intent tickIntent = new Intent("com.engram.app.TIMER_TICK");
                            tickIntent.putExtra("time", currentTimeInSeconds);
                            sendBroadcast(tickIntent);

                            notifyApp("stopped");
                            return;
                        }
                    } else {
                        currentTimeInSeconds++;
                    }
                    
                    if (currentTimeInSeconds % 2 == 0 || currentTimeInSeconds == 0) {
                        updateUIText();
                        
                        Intent tickIntent = new Intent("com.engram.app.TIMER_TICK");
                        tickIntent.putExtra("time", currentTimeInSeconds);
                        sendBroadcast(tickIntent);
                    } else {
                        android.util.Log.d("OverlayTimerService", "updateUIText skipped due to throttle - time: " + currentTimeInSeconds);
                        android.util.Log.d("OverlayTimerService", "TIMER_TICK broadcast skipped due to throttle - time: " + currentTimeInSeconds);
                    }
                }
                if (!( !isRunning && currentTimeInSeconds <= 0 )) {
                    handler.postDelayed(this, 1000);
                }
            }
        };
        handler.postDelayed(timerRunnable, 1000);
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
        int touchSlop = ViewConfiguration.get(this).getScaledTouchSlop();
        
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
                        if (diffX > touchSlop || diffY > touchSlop) {
                            isDragging = true;
                            return true; // intercept touch to handle dragging
                        }
                        break;
                }
                return false; // do not intercept, let child (WebView) handle it
            }

            @Override
            public boolean onTouchEvent(MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_MOVE:
                        if (isDragging) {
                            params.x = initialX + (int) (event.getRawX() - initialTouchX);
                            params.y = initialY + (int) (event.getRawY() - initialTouchY);
                            windowManager.updateViewLayout(this, params);
                            return true;
                        }
                        break;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        if (isDragging) {
                            isDragging = false;
                            return true;
                        }
                        isDragging = false;
                        return false;
                }
                return super.onTouchEvent(event);
            }
        };

        layout.setBackgroundColor(Color.TRANSPARENT);

        overlayWebView = new android.webkit.WebView(this);
        overlayWebView.getSettings().setJavaScriptEnabled(true);
        overlayWebView.getSettings().setDomStorageEnabled(true);
        overlayWebView.setBackgroundColor(Color.TRANSPARENT);
        overlayWebView.setClickable(true);
        overlayWebView.setFocusable(true);
        overlayWebView.setFocusableInTouchMode(true);
        
        overlayWebView.setWebViewClient(new android.webkit.WebViewClient() {
            @Override
            public void onPageFinished(android.webkit.WebView view, String url) {
                isPageReady = true;
                updateUIText();
            }
        });

        jsInterface = new JSInterface();
        overlayWebView.addJavascriptInterface(jsInterface, "OverlayManager");
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

        // Use combination of flags for optimal touch handling
        params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutFlag,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
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
                if (isRunning && currentTimeInSeconds > 0) {
                    android.util.Log.d("OverlayTimerService", "Ignoring duplicate START");
                    return START_STICKY;
                }
                if (intent.hasExtra("type")) {
                    currentType = intent.getStringExtra("type");
                }
                if (intent.hasExtra("title")) {
                    currentTitle = intent.getStringExtra("title");
                }
                if (intent.hasExtra("themeColor")) {
                    currentTheme = intent.getStringExtra("themeColor");
                }
                if (intent.hasExtra("time")) {
                    currentTimeInSeconds = intent.getIntExtra("time", 0);
                } else {
                    if ("pomodoro".equals(currentType)) {
                        currentTimeInSeconds = 1500;
                    } else {
                        currentTimeInSeconds = 0;
                    }
                }
                initialSessionSeconds = currentTimeInSeconds;
                isRunning = true;
                handler.removeCallbacks(timerRunnable);
                handler.postDelayed(timerRunnable, 1000);
                lastSentTime = -1;
                updateUIText();
            } else if ("PAUSE".equals(action)) {
                isRunning = false;
                lastSentTime = -1;
                updateUIText();
            } else if ("RESUME".equals(action)) {
                isRunning = true;
                lastSentTime = -1;
                updateUIText();
            } else if ("STOP".equals(action)) {
                lastSentTime = -1;
                isRunning = false;
                updateUIText();
                notifyApp("stopped");
                stopSelf();
                return START_NOT_STICKY;
            } else if ("UPDATE".equals(action)) {
                int time = intent.getIntExtra("time", 0);
                if (intent.hasExtra("themeColor")) {
                    String theme = intent.getStringExtra("themeColor");
                    if (theme != null && !theme.isEmpty()) {
                        currentTheme = theme;
                    }
                }
                currentTimeInSeconds = time;
                initialSessionSeconds = time;
                updateUIText();
            }
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (timerRunnable != null) {
            handler.removeCallbacks(timerRunnable);
        }
        if (overlayWebView != null) {
            try {
                overlayWebView.removeAllViews();
                overlayWebView.destroy();
                overlayWebView = null;
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
        if (floatingView != null && isViewAttached) {
            try {
                windowManager.removeView(floatingView);
                isViewAttached = false;
            } catch (Exception e) {}
        }
    }
}
