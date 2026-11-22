package com.standby.productivity;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "StandbyBackup")
public class StandbyBackupPlugin extends Plugin {
    @PluginMethod
    public void exportFile(PluginCall call) {
        if (call.getString("json") == null) { call.reject("Missing backup content."); return; }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/json")
            .putExtra(Intent.EXTRA_LOCAL_ONLY, true)
            .putExtra(Intent.EXTRA_TITLE, call.getString("name", "standby-backup.json"));
        getActivity().runOnUiThread(() -> {
            try { startActivityForResult(call, intent, "saveDocument"); }
            catch (RuntimeException error) { call.reject("Android file picker is unavailable."); }
        });
    }

    @ActivityCallback
    private void saveDocument(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            finish(call, false);
            return;
        }
        execute(() -> {
            try {
                OutputStream stream = getContext().getContentResolver().openOutputStream(data.getData(), "wt");
                if (stream == null) throw new IOException("Document unavailable");
                try (OutputStreamWriter writer = new OutputStreamWriter(stream, StandardCharsets.UTF_8)) {
                    writer.write(call.getString("json"));
                }
                finish(call, true);
            } catch (IOException | RuntimeException error) { call.reject("Unable to write the backup document."); }
        });
    }

    private void finish(PluginCall call, boolean saved) {
        JSObject response = new JSObject();
        response.put("saved", saved);
        call.resolve(response);
    }
}
