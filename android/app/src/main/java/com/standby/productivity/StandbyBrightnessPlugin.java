package com.standby.productivity;

import android.animation.ValueAnimator;
import android.provider.Settings;
import android.view.Window;
import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "StandbyBrightness")
public class StandbyBrightnessPlugin extends Plugin {
    private Float normal;
    private ValueAnimator ramp;
    private boolean paused;

    @PluginMethod
    public void setDimmed(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (call.getBoolean("dimmed", false) && !paused) dim();
                else restore();
                call.resolve();
            } catch (RuntimeException error) {
                call.reject("Unable to adjust the Standby window brightness.");
            }
        });
    }

    private void dim() {
        if (normal != null) return;
        Window window = getActivity().getWindow();
        float previous = window.getAttributes().screenBrightness;
        float from = previous;
        if (from < 0f) {
            int setting = Settings.System.getInt(getContext().getContentResolver(), Settings.System.SCREEN_BRIGHTNESS, -1);
            if (setting < 1 || setting > 255) return;
            from = setting / 255f;
        }
        if (from <= .04f) return;
        float target = Math.min(.24f, Math.max(.04f, from * .65f));
        normal = previous;
        ramp = ValueAnimator.ofFloat(from, target);
        ramp.setDuration(2400);
        ramp.addUpdateListener(animation -> apply((Float) animation.getAnimatedValue()));
        ramp.start();
    }

    private void apply(float brightness) {
        Window window = getActivity().getWindow();
        WindowManager.LayoutParams attributes = window.getAttributes();
        attributes.screenBrightness = brightness;
        window.setAttributes(attributes);
    }

    private void restore() {
        if (ramp != null) {
            ramp.cancel();
            ramp = null;
        }
        if (normal != null) {
            apply(normal);
            normal = null;
        }
    }

    @Override protected void handleOnPause() {
        paused = true;
        restore();
    }

    @Override protected void handleOnResume() {
        restore();
        paused = false;
    }

    @Override protected void handleOnDestroy() {
        paused = true;
        restore();
    }
}
