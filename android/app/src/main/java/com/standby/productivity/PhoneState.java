package com.standby.productivity;

import static com.standby.productivity.LinkWire.object;

import android.app.NotificationManager;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.provider.Settings;
import java.util.*;
import org.json.*;

/** UI state lives on the main thread. Private events are held only in memory. */
final class PhoneState {

    final Context context;
    final SharedPreferences prefs;
    final Handler main = new Handler(Looper.getMainLooper());
    final LinkedHashMap<String, JSONObject> inbox = new LinkedHashMap<>();
    final LinkedHashSet<String> seen = new LinkedHashSet<>();
    Runnable changed;
    String status = "Stopped",
        address = "",
        code = "",
        candidate = "",
        peerName = "",
        call = "",
        callId = "",
        callSource = "",
        banner = "";
    String pendingCommand = "",
        commandResult = "";
    long revision, codeUntil, lastCommandAt;
    boolean running, connected;
    JSONObject media = object("status", "disconnected");
    PhoneTransport transport;
    private static PhoneState instance;

    static synchronized PhoneState get(Context c) {
        if (instance == null) instance = new PhoneState(c.getApplicationContext());
        return instance;
    }

    PhoneState(Context c) {
        context = c;
        prefs = c.getSharedPreferences("phone_link", Context.MODE_PRIVATE);
    }

    boolean sender() {
        return "sender".equals(prefs.getString("role", "receiver"));
    }

    String name() {
        return prefs.getString("name", Build.MODEL);
    }

    boolean access() {
        ComponentName component = new ComponentName(context, PhoneListener.class);
        if (Build.VERSION.SDK_INT >= 27) return context
            .getSystemService(NotificationManager.class)
            .isNotificationListenerAccessGranted(component);
        String list = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        if (list != null) for (String item : list.split(":"))
            if (component.equals(ComponentName.unflattenFromString(item))) return true;
        return false;
    }

    void publish() {
        revision++;
        if (changed != null) changed.run();
    }

    void clearRemote() {
        connected = false;
        call = "";
        callId = "";
        callSource = "";
        banner = "";
        inbox.clear();
        seen.clear();
        media = object("status", "disconnected");
        commandResult = pendingCommand.isEmpty() ? "" : "Connection lost before confirmation";
        pendingCommand = "";
    }

    void clearHistory() {
        inbox.clear();
        banner = "";
        publish();
    }

    void prune() {
        long cutoff = System.currentTimeMillis() - prefs.getInt("minutes", 30) * 60000L;
        inbox.values().removeIf(row -> row.optLong("received") < cutoff);
    }

    JSONObject snapshot() {
        prune();
        List<JSONObject> rows = new ArrayList<>(inbox.values());
        Collections.reverse(rows);
        return object(
            "revision",
            revision,
            "role",
            sender() ? "sender" : "receiver",
            "name",
            name(),
            "running",
            running,
            "connected",
            connected,
            "paired",
            prefs.contains("peer"),
            "peerName",
            prefs.getString("peerName", ""),
            "host",
            prefs.getString("host", ""),
            "address",
            address,
            "status",
            status,
            "code",
            SystemClock.elapsedRealtime() < codeUntil ? code : "",
            "candidate",
            candidate,
            "access",
            access(),
            "phonePermission",
            context.checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE) ==
                PackageManager.PERMISSION_GRANTED,
            "apps",
            new JSONArray(prefs.getStringSet("apps", Collections.emptySet())),
            "previews",
            prefs.getBoolean("previews", false),
            "calls",
            prefs.getBoolean("calls", false),
            "music",
            prefs.getBoolean("music", false),
            "banners",
            prefs.getBoolean("banners", true),
            "minutes",
            prefs.getInt("minutes", 30),
            "rows",
            new JSONArray(rows),
            "call",
            call,
            "callId",
            callId,
            "callSource",
            callSource,
            "banner",
            banner,
            "media",
            media,
            "pending",
            pendingCommand,
            "result",
            commandResult
        );
    }

    void receive(JSONObject msg) {
        if (!connected) return;
        String type = msg.optString("type");
        if (sender()) {
            if (type.equals("command") && transport != null) {
                String result = PhoneCapture.command(this, msg);
                transport.send(object("type", "result", "id", msg.optString("id"), "result", result));
            }
            return;
        }
        String id = msg.optString("id");
        switch (type) {
            case "reset":
                inbox.clear();
                seen.clear();
                banner = "";
                call = "";
                callId = "";
                callSource = "";
                media = object("status", "absent");
                break;
            case "note":
                JSONObject row = msg.optJSONObject("row");
                if (row == null || id.isEmpty()) return;
                JSONObject previous = inbox.get(id);
                if (
                    previous != null &&
                    previous.optString("title").equals(row.optString("title")) &&
                    previous.optString("text").equals(row.optString("text"))
                ) return;
                String version =
                    id + ":" + row.optLong("time") + ":" + row.optString("title") + ":" + row.optString("text");
                // Remember only a digest when a row is removed or locally cleared.
                String digest = PhoneCapture.digest(version);
                if (!seen.add(digest)) return;
                if (seen.size() > 256) seen.remove(seen.iterator().next());
                try {
                    row.put("received", System.currentTimeMillis());
                } catch (JSONException ignored) {
                    return;
                }
                inbox.remove(id);
                inbox.put(id, row);
                if (inbox.size() > 40) inbox.remove(inbox.keySet().iterator().next());
                schedulePrune();
                if (
                    previous == null &&
                    !msg.optBoolean("quiet") &&
                    prefs.getBoolean("banners", true) &&
                    callId.isEmpty()
                ) banner = digest;
                else banner = "";
                break;
            case "remove":
                inbox.remove(id);
                banner = "";
                break;
            case "call":
                call = msg.optString("label");
                callId = id;
                callSource = "WhatsApp".equals(msg.optString("source")) ? "WhatsApp" : "";
                banner = "";
                break;
            case "media":
                JSONObject next = msg.optJSONObject("media");
                if (next == null) return;
                try {
                    if (
                        !next.has("art") &&
                        next.has("session") &&
                        next.optString("session").equals(media.optString("session"))
                    ) next.put("art", media.optString("art"));
                    next.put("updated", System.currentTimeMillis());
                } catch (JSONException ignored) {
                    return;
                }
                media = next;
                break;
            case "result":
                if (!id.equals(pendingCommand) || id.isEmpty()) return;
                pendingCommand = "";
                commandResult = msg.optString("result");
                break;
            default:
                return;
        }
        publish();
    }

    private final Runnable expire = () -> {
        prune();
        publish();
        schedulePrune();
    };

    void schedulePrune() {
        main.removeCallbacks(expire);
        if (!inbox.isEmpty()) {
            long oldest = inbox.values().iterator().next().optLong("received");
            main.postDelayed(
                expire,
                Math.max(20, oldest + prefs.getInt("minutes", 30) * 60000L - System.currentTimeMillis() + 1)
            );
        }
    }

    void command(String action, long position) {
        if (
            !connected || sender() || transport == null || !pendingCommand.isEmpty()
        ) throw new IllegalStateException("Control unavailable");
        long now = SystemClock.elapsedRealtime();
        if (now - lastCommandAt < 450) return;
        lastCommandAt = now;
        String id = UUID.randomUUID().toString();
        pendingCommand = id;
        commandResult = "";
        transport.send(
            object(
                "type",
                "command",
                "action",
                action,
                "position",
                position,
                "id",
                id,
                "session",
                media.optString("session")
            )
        );
        publish();
        main.postDelayed(
            () -> {
                if (id.equals(pendingCommand)) {
                    pendingCommand = "";
                    commandResult = "Command timed out";
                    publish();
                }
            },
            5000
        );
    }
}
