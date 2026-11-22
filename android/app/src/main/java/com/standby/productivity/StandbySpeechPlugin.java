package com.standby.productivity;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@CapacitorPlugin(name = "StandbySpeech")
public class StandbySpeechPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<Runnable> waiting = new ArrayList<>();
    private final Runnable timeout = () -> initialized(TextToSpeech.ERROR);
    private TextToSpeech engine;
    private int initAttempt;
    private boolean ready;
    private boolean destroyed;
    private PluginCall activeCall;
    private String activeId;

    private void whenReady(Runnable action) {
        if (destroyed || ready) {
            action.run();
            return;
        }
        waiting.add(action);
        if (engine != null) return;
        // Post the callback so the engine field is assigned before initialization is handled.
        int attempt = ++initAttempt;
        engine = new TextToSpeech(getContext().getApplicationContext(), result -> main.post(() -> {
            if (attempt == initAttempt) initialized(result);
        }));
        main.postDelayed(timeout, 12_000);
    }

    private void initialized(int result) {
        if (destroyed || waiting.isEmpty()) return;
        main.removeCallbacks(timeout);
        initAttempt++;
        ready = result == TextToSpeech.SUCCESS;
        if (ready) {
            engine.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) {}
                @Override public void onDone(String id) { main.post(() -> finish(id, null)); }
                @Override public void onError(String id) { onError(id, TextToSpeech.ERROR); }
                @Override public void onError(String id, int code) {
                    main.post(() -> finish(id, code == TextToSpeech.ERROR_NOT_INSTALLED_YET
                        ? "Install the selected offline voice in Android settings." : "Android speech failed (" + code + ")."));
                }
                @Override public void onStop(String id, boolean interrupted) {
                    main.post(() -> finish(id, "Android stopped speech."));
                }
            });
        } else {
            engine.shutdown();
            engine = null;
        }
        List<Runnable> actions = new ArrayList<>(waiting);
        waiting.clear();
        for (Runnable action : actions) action.run();
    }

    private List<Voice> offlineVoices() {
        List<Voice> local = new ArrayList<>();
        Set<Voice> installed = engine.getVoices();
        if (installed != null) {
            for (Voice voice : installed) {
                if (!voice.isNetworkConnectionRequired() &&
                    (voice.getFeatures() == null || !voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))) {
                    local.add(voice);
                }
            }
        }
        local.sort(Comparator.comparing(Voice::getName));
        return local;
    }

    @PluginMethod
    public void voices(PluginCall call) {
        main.post(() -> whenReady(() -> {
            if (!ready) { call.reject("Android text-to-speech could not start."); return; }
            JSArray result = new JSArray();
            for (Voice voice : offlineVoices()) {
                JSObject item = new JSObject();
                item.put("id", voice.getName());
                item.put("name", voice.getLocale().getDisplayName() + " · " + voice.getName());
                result.put(item);
            }
            JSObject response = new JSObject();
            response.put("voices", result);
            call.resolve(response);
        }));
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String id = call.getString("id");
        String text = call.getString("text");
        if (id == null || text == null || text.trim().isEmpty() || text.length() > 500) {
            call.reject("Enter a message of up to 500 characters.");
            return;
        }
        main.post(() -> {
            if (activeCall != null || destroyed) { call.reject("Android speech is busy or unavailable."); return; }
            activeId = id;
            activeCall = call;
            whenReady(() -> {
                if (!id.equals(activeId)) return;
                if (!ready) { finish(id, "Android text-to-speech could not start."); return; }
                String requested = call.getString("voice");
                List<Voice> voices = offlineVoices();
                Voice voice = null;
                if (requested != null) {
                    for (Voice candidate : voices) if (requested.equals(candidate.getName())) { voice = candidate; break; }
                } else {
                    Voice system = engine.getDefaultVoice();
                    if (system != null && voices.contains(system)) voice = system;
                    if (voice == null) {
                        for (Voice candidate : voices) {
                            if (Locale.getDefault().getLanguage().equals(candidate.getLocale().getLanguage())) {
                                voice = candidate;
                                break;
                            }
                        }
                    }
                    if (voice == null && !voices.isEmpty()) voice = voices.get(0);
                }
                if (voice == null || engine.setVoice(voice) != TextToSpeech.SUCCESS) {
                    finish(id, "Install or select a suitable offline voice in Android text-to-speech settings.");
                    return;
                }
                engine.setSpeechRate(Math.max(.5f, Math.min(2f, call.getFloat("rate", 1f))));
                Bundle params = new Bundle();
                params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, Math.max(0f, Math.min(1f, call.getFloat("volume", 1f))));
                if (engine.speak(text, TextToSpeech.QUEUE_FLUSH, params, id) == TextToSpeech.ERROR) {
                    finish(id, "Android could not queue this announcement.");
                }
            });
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            String id = call.getString("id");
            if (id != null && id.equals(activeId)) stopSpeech();
            call.resolve();
        });
    }

    private void finish(String id, String error) {
        if (id == null || !id.equals(activeId) || activeCall == null) return;
        PluginCall call = activeCall;
        activeCall = null;
        activeId = null;
        if (error == null) call.resolve(); else call.reject(error);
    }

    private void stopSpeech() {
        finish(activeId, "Speech was stopped.");
        if (ready) engine.stop();
    }

    @Override protected void handleOnPause() { main.post(this::stopSpeech); }

    @Override protected void handleOnDestroy() {
        main.post(() -> {
            destroyed = true;
            main.removeCallbacks(timeout);
            stopSpeech();
            ready = false;
            if (engine != null) engine.shutdown();
            engine = null;
            for (Runnable action : waiting) action.run();
            waiting.clear();
        });
    }
}
