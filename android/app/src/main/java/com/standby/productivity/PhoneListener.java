package com.standby.productivity;

import android.service.notification.*;

public final class PhoneListener extends NotificationListenerService {

    static PhoneListener bound;

    @Override
    public void onListenerConnected() {
        bound = this;
        PhoneCapture.resync(PhoneState.get(this));
    }

    @Override
    public void onListenerDisconnected() {
        bound = null;
        PhoneCapture.resync(PhoneState.get(this));
    }

    void snapshot() {
        if (PhoneService.live == null || !PhoneService.live.capture.active()) return;
        try {
            StatusBarNotification[] rows = getActiveNotifications();
            if (rows != null) for (
                int i = Math.max(0, rows.length - 40);
                i < rows.length;
                i++
            ) PhoneService.live.capture.note(rows[i], false, true);
        } catch (SecurityException ignored) {}
    }

    @Override
    public void onNotificationPosted(StatusBarNotification row) {
        if (PhoneService.live != null) PhoneService.live.capture.note(row, false, false);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification row) {
        if (PhoneService.live != null) PhoneService.live.capture.note(row, true, false);
    }
}
