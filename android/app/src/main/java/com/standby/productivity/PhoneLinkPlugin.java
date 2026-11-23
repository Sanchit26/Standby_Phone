package com.standby.productivity;

import android.Manifest;
import android.content.*;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.util.*;
import org.json.*;

@CapacitorPlugin(
    name = "PhoneLink",
    permissions = {
        @Permission(alias = "phone", strings = { Manifest.permission.READ_PHONE_STATE }),
        @Permission(alias = "notice", strings = { Manifest.permission.POST_NOTIFICATIONS }),
    }
)
public final class PhoneLinkPlugin extends Plugin {

    private PhoneState s;
    private final Runnable listener = () -> notifyListeners("change", new JSObject());

    @Override
    public void load() {
        s = PhoneState.get(getContext());
        s.main.post(() -> s.changed = listener);
    }

    @Override
    protected void handleOnDestroy() {
        s.main.post(() -> {
            if (s.changed == listener) s.changed = null;
        });
    }

    @Override
    protected void handleOnResume() {
        s.main.post(() -> s.publish());
    }

    @PluginMethod
    public void snapshot(PluginCall c) {
        s.main.post(() -> {
            try {
                c.resolve(new JSObject(s.snapshot().toString()));
            } catch (Exception e) {
                c.reject("Phone status unavailable");
            }
        });
    }

    @PluginMethod
    public void applications(PluginCall c) {
        Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        android.content.pm.PackageManager pm = getContext().getPackageManager();
        TreeMap<String, String> apps = new TreeMap<>();
        for (ResolveInfo info : pm.queryIntentActivities(launcher, 0)) {
            String pkg = info.activityInfo.packageName;
            if (!pkg.equals(getContext().getPackageName())) apps.put(
                pkg,
                PhoneCapture.limit(info.loadLabel(pm), 80)
            );
        }
        JSArray list = new JSArray();
        for (Map.Entry<String, String> a : apps.entrySet())
            list.put(LinkWire.object("pkg", a.getKey(), "name", a.getValue()));
        JSObject result = new JSObject();
        result.put("apps", list);
        c.resolve(result);
    }

    @PluginMethod
    public void action(PluginCall c) {
        s.main.post(() -> {
            String action = c.getString("action", ""),
                value = c.getString("value", "").trim();
            try {
                switch (action) {
                    case "role":
                        if (
                            !value.equals("sender") && !value.equals("receiver")
                        ) throw new IllegalArgumentException();
                        if (s.running || s.prefs.contains("peer")) throw new IllegalStateException(
                            "Stop and unpair before changing roles"
                        );
                        s.prefs.edit().putString("role", value).apply();
                        ((MainActivity) getActivity()).applyPhoneRole();
                        break;
                    case "start":
                        if (
                            s.sender() &&
                            !s.prefs.contains("peer") &&
                            !value.matches("[A-Za-z0-9_-]{43}\\.[0-9]{8}")
                        ) throw new IllegalArgumentException("Enter the complete receiver code");
                        Intent service = new Intent(getContext(), PhoneService.class).putExtra("offer", value);
                        if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(service);
                        else getContext().startService(service);
                        break;
                    case "approve":
                        if (s.transport != null) s.transport.approve(value);
                        break;
                    case "stop":
                    case "unpair":
                        if (PhoneService.live != null) PhoneService.live.halt();
                        getContext().stopService(new Intent(getContext(), PhoneService.class));
                        if (action.equals("unpair")) s.prefs
                            .edit()
                            .remove("peer")
                            .remove("peerName")
                            .remove("host")
                            .apply();
                        break;
                    case "name":
                    case "host":
                        if (s.running) throw new IllegalStateException("Stop the connection before editing");
                        s.prefs.edit().putString(action, PhoneCapture.limit(value, 64)).apply();
                        break;
                    case "calls":
                    case "music":
                    case "previews":
                    case "banners":
                        if (s.running && !action.equals("banners")) throw new IllegalStateException(
                            "Stop sharing before changing privacy settings"
                        );
                        s.prefs.edit().putBoolean(action, value.equals("true")).apply();
                        break;
                    case "minutes":
                        s.prefs
                            .edit()
                            .putInt("minutes", Math.max(1, Math.min(60, Integer.parseInt(value))))
                            .apply();
                        s.prune();
                        s.schedulePrune();
                        break;
                    case "apps":
                        if (s.running) throw new IllegalStateException(
                            "Stop sharing before changing selected apps"
                        );
                        Set<String> list = new HashSet<>(s.prefs.getStringSet("apps", Collections.emptySet()));
                        if (!list.remove(value)) list.add(value);
                        s.prefs.edit().putStringSet("apps", list).apply();
                        break;
                    case "clear":
                        s.clearHistory();
                        break;
                    case "notificationAccess":
                        getActivity().startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
                        break;
                    case "battery":
                        getActivity().startActivity(
                            new Intent(
                                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                android.net.Uri.parse("package:" + getContext().getPackageName())
                            )
                        );
                        break;
                    case "phonePermission":
                        requestPermissionForAlias("phone", c, "permissionDone");
                        return;
                    case "notificationPermission":
                        if (Build.VERSION.SDK_INT >= 33) {
                            requestPermissionForAlias("notice", c, "permissionDone");
                            return;
                        }
                        break;
                    case "command":
                        s.command(value, c.getLong("position", 0L));
                        break;
                    default:
                        throw new IllegalArgumentException("Unknown phone action");
                }
                s.publish();
                c.resolve();
            } catch (Exception e) {
                c.reject(e.getMessage() == null ? "Phone connection action failed" : e.getMessage());
            }
        });
    }

    @PermissionCallback
    private void permissionDone(PluginCall c) {
        s.main.post(() -> {
            PhoneCapture.resync(s);
            s.publish();
            c.resolve();
        });
    }
}
