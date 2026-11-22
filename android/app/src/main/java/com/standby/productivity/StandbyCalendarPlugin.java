package com.standby.productivity;

import android.Manifest;
import android.content.ContentUris;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import android.provider.CalendarContract.Calendars;
import android.provider.CalendarContract.Events;
import android.provider.CalendarContract.Instances;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Locale;

@CapacitorPlugin(name = "StandbyCalendar", permissions = {
    @Permission(alias = "calendar", strings = { Manifest.permission.READ_CALENDAR })
})
public class StandbyCalendarPlugin extends Plugin {
    private static final String READABLE = Calendars.VISIBLE + "=1 AND " + Calendars.CALENDAR_ACCESS_LEVEL + ">=" + Calendars.CAL_ACCESS_READ;

    @PluginMethod
    public void requestAccess(PluginCall call) {
        PermissionState state = getPermissionState("calendar");
        if (state == PermissionState.DENIED) {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getContext().getPackageName(), null));
            getActivity().runOnUiThread(() -> launch(call, intent, true));
        } else if (state == PermissionState.GRANTED) {
            accessResult(call);
        } else {
            requestPermissionForAlias("calendar", call, "accessResult");
        }
    }

    @PermissionCallback
    private void accessResult(PluginCall call) { checkPermissions(call); }

    private boolean hasAccess(PluginCall call) {
        if (getPermissionState("calendar") == PermissionState.GRANTED) return true;
        call.reject("Calendar read permission is required.", "PERMISSION");
        return false;
    }

    private static String color(Cursor cursor, int col) {
        return cursor.isNull(col) ? null : String.format(Locale.ROOT, "#%06x", cursor.getInt(col) & 0xFFFFFF);
    }

    @PluginMethod
    public void calendars(PluginCall call) {
        if (!hasAccess(call)) return;
        String[] columns = { Calendars._ID, Calendars.CALENDAR_DISPLAY_NAME, Calendars.CALENDAR_COLOR };
        try (Cursor cursor = getContext().getContentResolver().query(Calendars.CONTENT_URI, columns, READABLE, null,
            Calendars.CALENDAR_DISPLAY_NAME + " ASC, " + Calendars._ID + " ASC")) {
            if (cursor == null) { call.reject("Calendar provider is unavailable."); return; }
            JSArray calendars = new JSArray();
            while (cursor.moveToNext()) {
                JSObject row = new JSObject();
                row.put("id", cursor.getString(0));
                row.put("name", cursor.isNull(1) ? "Calendar " + cursor.getString(0) : cursor.getString(1));
                row.put("color", color(cursor, 2));
                calendars.put(row);
            }
            JSObject response = new JSObject();
            response.put("calendars", calendars);
            call.resolve(response);
        } catch (SecurityException error) {
            call.reject("Calendar read permission is required.", "PERMISSION");
        } catch (RuntimeException error) { call.reject("Calendar provider is unavailable."); }
    }

    @PluginMethod
    public void instances(PluginCall call) {
        if (!hasAccess(call)) return;
        Long begin = call.getLong("begin"), end = call.getLong("end");
        JSArray requested = call.getArray("ids");
        if (begin == null || end == null || begin >= end || end - begin > 40L * 24 * 60 * 60 * 1000 ||
            requested == null || requested.length() > 100) {
            call.reject("Choose a bounded calendar range and up to 100 calendars.");
            return;
        }
        ArrayList<String> ids = new ArrayList<>();
        for (int i = 0; i < requested.length(); i++) {
            String id = requested.optString(i);
            if (!id.matches("[0-9]{1,19}")) { call.reject("Invalid calendar identifier."); return; }
            ids.add(id);
        }
        JSArray events = new JSArray();
        if (!ids.isEmpty()) {
            Uri.Builder uri = Instances.CONTENT_URI.buildUpon();
            ContentUris.appendId(uri, begin);
            ContentUris.appendId(uri, end);
            String[] columns = { Instances.CALENDAR_ID, Instances.EVENT_ID, Instances.TITLE, Instances.BEGIN,
                Instances.END, Instances.ALL_DAY, Instances.DISPLAY_COLOR };
            String where = READABLE + " AND " + Instances.CALENDAR_ID + " IN (" +
                String.join(",", Collections.nCopies(ids.size(), "?")) + ") AND (" +
                Instances.STATUS + " IS NULL OR " + Instances.STATUS + "!=" + Events.STATUS_CANCELED + ")";
            try (Cursor cursor = getContext().getContentResolver().query(uri.build(), columns, where,
                ids.toArray(new String[0]), Instances.BEGIN + " ASC")) {
                if (cursor == null) { call.reject("Calendar provider is unavailable."); return; }
                while (cursor.moveToNext()) {
                    JSObject row = new JSObject();
                    row.put("calendarId", cursor.getString(0));
                    row.put("eventId", cursor.getString(1));
                    row.put("title", cursor.getString(2));
                    row.put("begin", cursor.getLong(3));
                    row.put("end", cursor.isNull(4) ? cursor.getLong(3) : cursor.getLong(4));
                    row.put("allDay", cursor.getInt(5) == 1);
                    row.put("color", color(cursor, 6));
                    events.put(row);
                }
            } catch (SecurityException error) {
                call.reject("Calendar read permission is required.", "PERMISSION");
                return;
            } catch (RuntimeException error) { call.reject("Could not read calendar occurrences."); return; }
        }
        JSObject response = new JSObject();
        response.put("events", events);
        call.resolve(response);
    }

    @PluginMethod
    public void viewEvent(PluginCall call) {
        if (!hasAccess(call)) return;
        String id = call.getString("eventId", "");
        Long begin = call.getLong("begin"), end = call.getLong("end");
        if (!id.matches("[0-9]{1,19}") || begin == null || end == null) { call.reject("Invalid event."); return; }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, ContentUris.withAppendedId(Events.CONTENT_URI, Long.parseLong(id)));
            intent.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, begin.longValue());
            intent.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end.longValue());
            intent.putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, call.getBoolean("allDay", false));
            getActivity().runOnUiThread(() -> launch(call, intent, false));
        } catch (NumberFormatException error) { call.reject("Invalid event."); }
    }

    private void launch(PluginCall call, Intent intent, boolean settings) {
        try {
            getActivity().startActivity(intent);
            if (settings) accessResult(call); else call.resolve();
        } catch (RuntimeException error) {
            call.reject(settings ? "Could not open Android app settings." : "No calendar app can open this event.");
        }
    }
}
