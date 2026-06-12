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
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;

public class OverlayTimerService extends Service {

    private WindowManager windowManager;
    private View floatingView;
    private TextView timerText;
    private TextView titleText;
    private String currentType = "pomodoro";
    private String currentTitle = "Focus Timer";

    private WindowManager.LayoutParams params;

    private int currentTimeInSeconds = -1;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timerRunnable = new Runnable() {
        @Override
        public void run() {
            if (currentTimeInSeconds > 0) {
                currentTimeInSeconds--;
                updateUIText();
                handler.postDelayed(this, 1000);
            }
        }
    };

    private void updateUIText() {
        if (timerText != null && currentTimeInSeconds >= 0) {
            int minutes = currentTimeInSeconds / 60;
            int seconds = currentTimeInSeconds % 60;
            timerText.setText(String.format("%02d:%02d", minutes, seconds));
        }
        if (titleText != null) {
            if ("pomodoro".equals(currentType)) {
                titleText.setText("🍅 " + currentTitle);
            } else {
                titleText.setText("📘 " + currentTitle);
            }
        }
        if (floatingView != null) {
            // Update background color based on type
            android.graphics.drawable.GradientDrawable shape = (android.graphics.drawable.GradientDrawable) floatingView.getBackground();
            if ("pomodoro".equals(currentType)) {
                shape.setColor(Color.parseColor("#E53935")); // Red
            } else {
                shape.setColor(Color.parseColor("#1E88E5")); // Blue
            }
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // Not bound
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        Notification notification = new NotificationCompat.Builder(this, "OVERLAY_CHANNEL")
                .setContentTitle("Pomodoro Timer")
                .setContentText("Overlay is active")
                // Need a valid icon, using default android one for now
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
        
        // Simple layout constructed programmatically to avoid needing XML files
        android.widget.LinearLayout layout = new android.widget.LinearLayout(this);
        layout.setOrientation(android.widget.LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        
        // Set rounded corners or a simple shape, here we just use basic View properties
        android.graphics.drawable.GradientDrawable shape = new android.graphics.drawable.GradientDrawable();
        shape.setShape(android.graphics.drawable.GradientDrawable.RECTANGLE);
        shape.setCornerRadii(new float[] { 30, 30, 30, 30, 30, 30, 30, 30 });
        shape.setColor(Color.parseColor("#E53935"));
        layout.setBackground(shape);
        layout.setPadding(20, 20, 20, 20);

        titleText = new TextView(this);
        titleText.setText("🍅 Focus Timer");
        titleText.setTextColor(Color.WHITE);
        titleText.setTextSize(14);
        titleText.setGravity(Gravity.CENTER);
        layout.addView(titleText);

        timerText = new TextView(this);
        timerText.setText("25:00");
        timerText.setTextColor(Color.WHITE);
        timerText.setTextSize(24);
        timerText.setGravity(Gravity.CENTER);
        timerText.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        layout.addView(timerText);
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

        floatingView.setOnTouchListener(new View.OnTouchListener() {
            private int initialX;
            private int initialY;
            private float initialTouchX;
            private float initialTouchY;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = params.x;
                        initialY = params.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        return true;
                    case MotionEvent.ACTION_UP:
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        params.x = initialX + (int) (event.getRawX() - initialTouchX);
                        params.y = initialY + (int) (event.getRawY() - initialTouchY);
                        windowManager.updateViewLayout(floatingView, params);
                        return true;
                }
                return false;
            }
        });

        windowManager.addView(floatingView, params);
        
        // Read initial state from SharedPreferences (Capacitor stores it as CapacitorStorage)
        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String savedTime = prefs.getString("pomodoroTime", "");
        if (!savedTime.isEmpty()) {
            try {
                String[] parts = savedTime.split(":");
                currentTimeInSeconds = Integer.parseInt(parts[0]) * 60 + Integer.parseInt(parts[1]);
                updateUIText();
                handler.removeCallbacks(timerRunnable);
                handler.postDelayed(timerRunnable, 1000);
            } catch (Exception e) {
                timerText.setText(savedTime);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if ("START".equals(action)) {
                if (intent.hasExtra("type")) {
                    currentType = intent.getStringExtra("type");
                }
                if (intent.hasExtra("title")) {
                    currentTitle = intent.getStringExtra("title");
                }
                updateUIText();
            } else if ("STOP".equals(action)) {
                handler.removeCallbacks(timerRunnable);
                stopSelf();
                return START_NOT_STICKY;
            } else if ("UPDATE".equals(action)) {
                int time = intent.getIntExtra("time", 0);
                currentTimeInSeconds = time;
                updateUIText();
                handler.removeCallbacks(timerRunnable);
                handler.postDelayed(timerRunnable, 1000);
            }
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(timerRunnable);
        super.onDestroy();
        if (floatingView != null) {
            windowManager.removeView(floatingView);
        }
    }
}
