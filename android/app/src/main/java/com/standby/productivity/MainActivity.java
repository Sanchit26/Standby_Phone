package com.standby.productivity;

import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(StandbySpeechPlugin.class);
        registerPlugin(StandbyBrightnessPlugin.class);
        registerPlugin(StandbyCalendarPlugin.class);
        registerPlugin(StandbyBackupPlugin.class);
        super.onCreate(savedInstanceState);
        configureEdgeToEdge();
        hideSystemBars();
    }

    @Override
    public void onStart() {
        super.onStart();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    public void onStop() {
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        super.onStop();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        ViewCompat.requestApplyInsets(getWindow().getDecorView());
        if (hasWindowFocus()) hideSystemBars();
    }

    private void configureEdgeToEdge() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        View decor = getWindow().getDecorView();
        WebView webView = getBridge().getWebView();
        // Keep the WebView full width, including on versions that require native inset handling.
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            int keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            view.setPadding(0, 0, 0, keyboard);
            float density = webView.getResources().getDisplayMetrics().density;
            webView.evaluateJavascript(String.format(Locale.ROOT, """
                (() => {
                    const style = document.documentElement.style;
                    style.setProperty('--standby-native-top', '%dpx');
                    style.setProperty('--standby-native-right', '%dpx');
                    style.setProperty('--standby-native-bottom', '%dpx');
                    style.setProperty('--standby-native-left', '%dpx');
                })()
                """, (int) Math.ceil(safe.top / density), (int) Math.ceil(safe.right / density),
                (int) Math.ceil(safe.bottom / density), (int) Math.ceil(safe.left / density)), null);
            return insets;
        });
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                ViewCompat.requestApplyInsets(decor);
            }
        });
        ViewCompat.requestApplyInsets(decor);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}
