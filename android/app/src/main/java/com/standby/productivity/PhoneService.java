package com.standby.productivity;

import android.app.*;
import android.content.*;
import android.os.*;
import androidx.core.app.NotificationCompat;

public final class PhoneService extends Service {

    static PhoneService live;
    PhoneCapture capture;
    private PhoneState s;
    static final String STOP = "com.standby.productivity.STOP_SHARING";

    @Override
    public void onCreate() {
        super.onCreate();
        s = PhoneState.get(this);
        capture = new PhoneCapture(s);
        live = this;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || STOP.equals(intent.getAction())) {
            halt();
            stopSelf();
            return START_NOT_STICKY;
        }
        String channel = "standby_phone_connection";
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(
            new NotificationChannel(channel, "Phone connection", NotificationManager.IMPORTANCE_LOW)
        );
        PendingIntent open = PendingIntent.getActivity(
            this,
            0,
            new Intent(this, MainActivity.class),
            PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent stop = PendingIntent.getService(
            this,
            1,
            new Intent(this, PhoneService.class).setAction(STOP),
            PendingIntent.FLAG_IMMUTABLE
        );
        Notification n = new NotificationCompat.Builder(this, channel)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(s.sender() ? "Standby phone sharing" : "Standby receiver")
            .setContentText("Home Wi-Fi connection enabled")
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(open)
            .addAction(android.R.drawable.ic_media_pause, "Stop", stop)
            .build();
        try {
            startForeground(1313, n);
        } catch (RuntimeException denied) {
            halt();
            s.status = "Open Standby and start the connection again";
            s.publish();
            stopSelf();
            return START_NOT_STICKY;
        }
        halt();
        s.running = true;
        capture.refresh();
        s.status = "Starting";
        s.transport = new PhoneTransport(
            s,
            intent.getStringExtra("offer") == null ? "" : intent.getStringExtra("offer")
        );
        s.transport.start();
        s.publish();
        return START_NOT_STICKY;
    }

    void halt() {
        if (s.transport != null) s.transport.close();
        s.transport = null;
        s.running = false;
        capture.stop();
        s.clearRemote();
        s.seen.clear();
        s.code = "";
        s.candidate = "";
        s.address = "";
        s.status = "Stopped";
        s.publish();
    }

    @Override
    public void onDestroy() {
        halt();
        live = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent i) {
        return null;
    }
}
