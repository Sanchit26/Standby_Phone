package com.standby.productivity;

import static com.standby.productivity.LinkWire.object;

import android.app.Notification;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.graphics.drawable.Drawable;
import android.media.MediaMetadata;
import android.media.session.*;
import android.os.*;
import android.service.notification.StatusBarNotification;
import android.telephony.*;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.Pattern;
import org.json.*;

/** All callbacks run on the main looper and read the current sharing policy before exporting data. */
final class PhoneCapture {

    static final String SPOTIFY = "com.spotify.music";
    private final PhoneState s;
    private final TelephonyManager telephony;
    private final MediaSessionManager sessions;
    private MediaController controller;
    private String sessionId = "",
        lastArt = "";
    private boolean mediaListening;
    private PhoneStateListener legacy;
    private TelephonyCallback modern;
    private final Ringing ringing = new Ringing();
    private final Runnable expireCallNotices = this::pruneCallNotices;
    private final Set<String> exported = new LinkedHashSet<>();
    private static final Pattern SENSITIVE = Pattern.compile(
        "(?i)(?:\\botp\\b|one[ -]time|verification|passcode|security code|authenticat|\\b\\d(?:[ -]?\\d){3,7}\\b)"
    );
    private final MediaController.Callback player = new MediaController.Callback() {
        @Override
        public void onPlaybackStateChanged(PlaybackState state) {
            publishMusic(false);
        }

        @Override
        public void onMetadataChanged(MediaMetadata data) {
            publishMusic(true);
        }

        @Override
        public void onSessionDestroyed() {
            selectSession();
        }
    };
    private final MediaSessionManager.OnActiveSessionsChangedListener mediaChanged = items -> selectSession();

    PhoneCapture(PhoneState s) {
        this.s = s;
        telephony = s.context.getSystemService(TelephonyManager.class);
        sessions = s.context.getSystemService(MediaSessionManager.class);
    }

    static String digest(String text) {
        try {
            return Base64.encodeToString(
                MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)),
                Base64.NO_WRAP
            );
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static String limit(CharSequence text, int max) {
        return text == null ? "" : text.subSequence(0, Math.min(text.length(), max)).toString();
    }

    boolean active() {
        return s.running && s.sender() && s.connected && s.transport != null;
    }

    void send(JSONObject message) {
        if (active()) s.transport.send(message);
    }

    static String image(Bitmap src, int size) {
        if (src == null || src.isRecycled()) return "";
        float scale = Math.min(1f, (float) size / Math.max(src.getWidth(), src.getHeight()));
        Bitmap small = Bitmap.createScaledBitmap(
            src,
            Math.max(1, Math.round(src.getWidth() * scale)),
            Math.max(1, Math.round(src.getHeight() * scale)),
            true
        );
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        small.compress(Bitmap.CompressFormat.PNG, 100, bytes);
        if (small != src) small.recycle();
        return bytes.size() > 128 * 1024
            ? ""
            : "data:image/png;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
    }

    void note(StatusBarNotification sbn, boolean removed, boolean quiet) {
        if (!s.running || !s.sender() || !s.access() || sbn == null) return;
        String pkg = sbn.getPackageName(),
            id = digest(sbn.getKey());
        if (
            pkg.equals(s.context.getPackageName()) ||
            !s.prefs.getStringSet("apps", Collections.emptySet()).contains(pkg)
        ) return;
        Notification n = sbn.getNotification();
        if (removed) {
            publishCall(ringing.notification(id, null));
            remove(id);
            return;
        }
        boolean whatsapp = pkg.equals("com.whatsapp") || pkg.equals("com.whatsapp.w4b");
        boolean call = incomingCall(n, whatsapp);
        if (call && s.prefs.getBoolean("calls", false)) {
            String label = "Incoming Call";
            if (n.visibility == Notification.VISIBILITY_PUBLIC && s.prefs.getBoolean("previews", false)) {
                String title = limit(n.extras.getCharSequence(Notification.EXTRA_TITLE), 100);
                if (!title.isEmpty() && !SENSITIVE.matcher(title).find()) label = title;
            }
            long expires = sbn.getPostTime() + 120_000;
            if (expires > System.currentTimeMillis()) {
                publishCall(ringing.notification(id, label, whatsapp, expires));
                pruneCallNotices();
            }
            remove(id);
            return;
        }
        publishCall(ringing.notification(id, null));
        if (!active()) return;
        if (sbn.isOngoing() || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) {
            remove(id);
            return;
        }
        String title = limit(n.extras.getCharSequence(Notification.EXTRA_TITLE), 120);
        String body = limit(n.extras.getCharSequence(Notification.EXTRA_TEXT), 220);
        if (!publicPreview(s.prefs.getBoolean("previews", false), n.visibility, title, body)) {
            title = "Notification";
            body = "";
        }
        String app = pkg,
            icon = "";
        try {
            android.content.pm.PackageManager pm = s.context.getPackageManager();
            app = limit(pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)), 80);
        } catch (Exception ignored) {}
        try {
            Drawable drawable = n.getSmallIcon().loadDrawable(s.context.createPackageContext(pkg, 0));
            if (drawable != null) {
                Bitmap bitmap = Bitmap.createBitmap(40, 40, Bitmap.Config.ARGB_8888);
                drawable.setBounds(0, 0, 40, 40);
                drawable.draw(new Canvas(bitmap));
                icon = image(bitmap, 40);
                bitmap.recycle();
            }
        } catch (Exception ignored) {}
        if (exported.size() >= 80 && !exported.contains(id)) exported.remove(exported.iterator().next());
        exported.add(id);
        send(
            object(
                "type",
                "note",
                "id",
                id,
                "quiet",
                quiet,
                "row",
                object(
                    "id",
                    id,
                    "pkg",
                    pkg,
                    "app",
                    app,
                    "title",
                    title,
                    "text",
                    body,
                    "icon",
                    icon,
                    "time",
                    sbn.getPostTime()
                )
            )
        );
    }

    private void remove(String id) {
        if (exported.remove(id)) send(object("type", "remove", "id", id));
    }

    static boolean incomingCall(Notification notice, boolean whatsapp) {
        if (
            !Notification.CATEGORY_CALL.equals(notice.category) ||
            (notice.flags & Notification.FLAG_GROUP_SUMMARY) != 0
        ) return false;
        if (Build.VERSION.SDK_INT >= 34 && notice.extras != null) {
            int type = notice.extras.getInt(Notification.EXTRA_CALL_TYPE, 0);
            if (type != 0) return type == Notification.CallStyle.CALL_TYPE_INCOMING;
        }
        return (
            (whatsapp || Build.VERSION.SDK_INT < 34) &&
            notice.fullScreenIntent != null &&
            (notice.flags & Notification.FLAG_ONGOING_EVENT) != 0
        );
    }

    static boolean publicPreview(boolean enabled, int visibility, String title, String body) {
        return (
            enabled &&
            visibility == Notification.VISIBILITY_PUBLIC &&
            !SENSITIVE.matcher(title + " " + body).find()
        );
    }

    void phone(int state) {
        publishCall(ringing.mobile(state == TelephonyManager.CALL_STATE_RINGING));
    }

    private void publishCall(JSONObject update) {
        if (update != null && s.prefs.getBoolean("calls", false)) send(update);
    }

    private void pruneCallNotices() {
        s.main.removeCallbacks(expireCallNotices);
        publishCall(ringing.prune(System.currentTimeMillis()));
        long deadline = ringing.nextExpiry();
        if (deadline != Long.MAX_VALUE) s.main.postDelayed(
            expireCallNotices,
            Math.max(1, deadline - System.currentTimeMillis())
        );
    }

    /** Both Android sources describe the same ringing interval on many phones. */
    static final class Ringing {

        private record Notice(String label, boolean whatsapp, long expires) {}

        private final LinkedHashMap<String, Notice> notices = new LinkedHashMap<>();
        private String episode = "",
            lastLabel = "",
            lastSource = "";
        private boolean mobile;

        JSONObject mobile(boolean ringing) {
            if (mobile && !ringing) notices.values().removeIf(notice -> !notice.whatsapp());
            mobile = ringing;
            return update();
        }

        JSONObject notification(String id, String label) {
            return notification(id, label, false);
        }

        JSONObject notification(String id, String label, boolean whatsapp) {
            return notification(id, label, whatsapp, Long.MAX_VALUE);
        }

        JSONObject notification(String id, String label, boolean whatsapp, long expires) {
            if (label == null && notices.remove(id) == null) return null;
            if (label != null) {
                if (notices.size() >= 16 && !notices.containsKey(id)) notices.remove(
                    notices.keySet().iterator().next()
                );
                notices.put(id, new Notice(label, whatsapp, expires));
            }
            return update();
        }

        private JSONObject update() {
            Notice notice = notices
                .values()
                .stream()
                .filter(item -> !mobile || !item.whatsapp())
                .findFirst()
                .orElse(null);
            String label = notice == null ? (mobile ? "Incoming Call" : "") : notice.label();
            String source = notice != null && notice.whatsapp() ? "WhatsApp" : "";
            if (label.equals(lastLabel) && source.equals(lastSource)) return null;
            if (!source.equals(lastSource)) episode = "";
            lastLabel = label;
            lastSource = source;
            if (label.isEmpty()) episode = "";
            else if (episode.isEmpty()) episode = UUID.randomUUID().toString();
            return snapshot();
        }

        JSONObject snapshot() {
            return object("type", "call", "id", episode, "label", lastLabel, "source", lastSource);
        }

        void clearNotices() {
            notices.clear();
            update();
        }

        JSONObject prune(long now) {
            return notices.values().removeIf(notice -> notice.expires() <= now) ? update() : null;
        }

        long nextExpiry() {
            return notices.values().stream().mapToLong(Notice::expires).min().orElse(Long.MAX_VALUE);
        }

        void clear() {
            notices.clear();
            episode = "";
            lastLabel = "";
            lastSource = "";
            mobile = false;
        }
    }

    @androidx.annotation.RequiresApi(31)
    private class CallMonitor extends TelephonyCallback implements TelephonyCallback.CallStateListener {

        public void onCallStateChanged(int state) {
            phone(state);
        }
    }

    void refresh() {
        if (!s.running || !s.sender()) return;
        if (
            modern == null &&
            legacy == null &&
            s.prefs.getBoolean("calls", false) &&
            s.context.checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE) ==
            PackageManager.PERMISSION_GRANTED &&
            telephony != null
        ) {
            try {
                if (Build.VERSION.SDK_INT >= 31) {
                    modern = new CallMonitor();
                    telephony.registerTelephonyCallback(s.context.getMainExecutor(), modern);
                } else {
                    legacy = new PhoneStateListener() {
                        public void onCallStateChanged(int state, String ignored) {
                            phone(state);
                        }
                    };
                    telephony.listen(legacy, PhoneStateListener.LISTEN_CALL_STATE);
                }
            } catch (SecurityException ignored) {
                modern = null;
                legacy = null;
            }
        }
        disconnect();
        if (PhoneListener.bound == null || !s.access()) ringing.clearNotices();
        pruneCallNotices();
        if (!active()) return;
        send(object("type", "reset"));
        send(ringing.snapshot());
        if (s.prefs.getBoolean("music", false) && s.access()) {
            try {
                sessions.addOnActiveSessionsChangedListener(
                    mediaChanged,
                    new ComponentName(s.context, PhoneListener.class),
                    s.main
                );
                mediaListening = true;
            } catch (SecurityException ignored) {}
        }
        selectSession();
        if (PhoneListener.bound != null) PhoneListener.bound.snapshot();
    }

    void stop() {
        try {
            if (modern != null && Build.VERSION.SDK_INT >= 31) telephony.unregisterTelephonyCallback(modern);
            if (legacy != null) telephony.listen(legacy, PhoneStateListener.LISTEN_NONE);
        } catch (SecurityException revoked) {
            /* Permission may have changed in Settings. */
        }
        modern = null;
        legacy = null;
        disconnect();
        s.main.removeCallbacks(expireCallNotices);
        ringing.clear();
    }

    void disconnect() {
        try {
            if (mediaListening) sessions.removeOnActiveSessionsChangedListener(mediaChanged);
        } catch (SecurityException revoked) {
            /* Notification Access was revoked. */
        }
        mediaListening = false;
        if (controller != null) controller.unregisterCallback(player);
        controller = null;
        lastArt = "";
        exported.clear();
    }

    private void selectSession() {
        MediaController next = null;
        if (active() && mediaListening) try {
            for (MediaController c : sessions.getActiveSessions(new ComponentName(s.context, PhoneListener.class)))
                if (SPOTIFY.equals(c.getPackageName())) {
                    next = c;
                    break;
                }
        } catch (SecurityException ignored) {}
        if (
            next != null && controller != null && next.getSessionToken().equals(controller.getSessionToken())
        ) return;
        if (controller != null) controller.unregisterCallback(player);
        controller = next;
        lastArt = "";
        sessionId = UUID.randomUUID().toString();
        if (next != null) next.registerCallback(player, s.main);
        publishMusic(true);
    }

    private void publishMusic(boolean artChanged) {
        if (!active()) return;
        String status = !s.prefs.getBoolean("music", false)
            ? "disabled"
            : !s.access()
                ? "permission"
                : controller == null
                    ? "absent"
                    : "active";
        JSONObject m = object("status", status);
        if ("active".equals(status)) {
            MediaMetadata d = controller.getMetadata();
            PlaybackState p = controller.getPlaybackState();
            m = mediaSnapshot(
                d,
                p,
                sessionId,
                controller.getPlaybackInfo() != null &&
                    controller.getPlaybackInfo().getPlaybackType() ==
                    MediaController.PlaybackInfo.PLAYBACK_TYPE_REMOTE
            );
            if (artChanged) {
                Bitmap bitmap = d == null ? null : d.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
                if (bitmap == null && d != null) bitmap = d.getBitmap(MediaMetadata.METADATA_KEY_ART);
                if (bitmap == null && d != null) bitmap = d.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
                String art = image(bitmap, 176),
                    key = digest(art);
                if (!key.equals(lastArt)) {
                    lastArt = key;
                    try {
                        m.put("art", art);
                    } catch (JSONException ignored) {}
                }
            }
        }
        send(object("type", "media", "media", m));
    }

    static JSONObject mediaSnapshot(MediaMetadata data, PlaybackState state, String id, boolean remote) {
        int playback = state == null ? PlaybackState.STATE_NONE : state.getState();
        long position = state == null ? -1 : state.getPosition();
        if (
            state != null &&
            position >= 0 &&
            playback == PlaybackState.STATE_PLAYING &&
            state.getLastPositionUpdateTime() > 0
        ) position += (long) ((SystemClock.elapsedRealtime() - state.getLastPositionUpdateTime()) *
            state.getPlaybackSpeed());
        return object(
            "status",
            "active",
            "session",
            id,
            "title",
            meta(data, MediaMetadata.METADATA_KEY_TITLE),
            "artist",
            meta(data, MediaMetadata.METADATA_KEY_ARTIST),
            "album",
            meta(data, MediaMetadata.METADATA_KEY_ALBUM),
            "duration",
            data == null ? 0 : data.getLong(MediaMetadata.METADATA_KEY_DURATION),
            "position",
            position,
            "speed",
            state == null ? 0 : state.getPlaybackSpeed(),
            "playing",
            playback == PlaybackState.STATE_PLAYING,
            "state",
            playback,
            "actions",
            state == null ? 0 : state.getActions(),
            "remote",
            remote
        );
    }

    private static String meta(MediaMetadata d, String key) {
        return d == null ? "" : limit(d.getText(key), 200);
    }

    static void resync(PhoneState s) {
        if (PhoneService.live != null) PhoneService.live.capture.refresh();
    }

    static String command(PhoneState s, JSONObject cmd) {
        PhoneCapture capture = PhoneService.live == null ? null : PhoneService.live.capture;
        if (
            capture == null || !capture.active() || !s.prefs.getBoolean("music", false) || !s.access()
        ) return "Sharing unavailable";
        MediaController c = capture.controller;
        if (
            c == null || !capture.sessionId.equals(cmd.optString("session")) || c.getPlaybackState() == null
        ) return "Spotify session changed";
        return dispatch(c, cmd);
    }

    static String dispatch(MediaController c, JSONObject cmd) {
        PlaybackState state = c.getPlaybackState();
        if (state == null) return "Spotify session changed";
        long flags = state.getActions();
        String action = cmd.optString("action");
        MediaController.TransportControls t = c.getTransportControls();
        try {
            switch (action) {
                case "play":
                case "pause":
                    boolean play = action.equals("play");
                    if ((flags & (play ? PlaybackState.ACTION_PLAY : PlaybackState.ACTION_PAUSE)) != 0) {
                        if (play) t.play();
                        else t.pause();
                    } else if ((flags & PlaybackState.ACTION_PLAY_PAUSE) != 0) {
                        if (play == (state.getState() == PlaybackState.STATE_PLAYING)) return play
                            ? "Already playing"
                            : "Already paused";
                        int key = android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
                        boolean handled = c.dispatchMediaButtonEvent(
                            new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, key)
                        );
                        c.dispatchMediaButtonEvent(
                            new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, key)
                        );
                        if (!handled) return "Control unsupported";
                    } else break;
                    return "Sent to Spotify";
                case "previous":
                    if ((flags & PlaybackState.ACTION_SKIP_TO_PREVIOUS) == 0) break;
                    t.skipToPrevious();
                    return "Sent to Spotify";
                case "next":
                    if ((flags & PlaybackState.ACTION_SKIP_TO_NEXT) == 0) break;
                    t.skipToNext();
                    return "Sent to Spotify";
                case "seek":
                    long pos = cmd.optLong("position", -1);
                    if (
                        (flags & PlaybackState.ACTION_SEEK_TO) == 0 ||
                        pos < 0 ||
                        c.getMetadata() == null ||
                        pos > c.getMetadata().getLong(MediaMetadata.METADATA_KEY_DURATION)
                    ) break;
                    t.seekTo(pos);
                    return "Sent to Spotify";
                default:
                    break;
            }
        } catch (RuntimeException ignored) {
            return "Spotify rejected the command";
        }
        return "Control unsupported";
    }
}
