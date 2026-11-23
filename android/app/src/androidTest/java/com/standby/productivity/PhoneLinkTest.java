package com.standby.productivity;

import static com.standby.productivity.LinkWire.object;
import static org.junit.Assert.*;

import android.app.Notification;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.os.Looper;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.util.concurrent.*;
import org.json.JSONObject;
import org.junit.Test;

public class PhoneLinkTest {

    @Test
    @SdkSuppress(minSdkVersion = 34)
    public void whatsappUsesStructuredCallIndicators() {
        Notification notice = new Notification();
        notice.category = Notification.CATEGORY_MESSAGE;
        notice.extras.putInt(Notification.EXTRA_CALL_TYPE, Notification.CallStyle.CALL_TYPE_INCOMING);
        assertFalse(PhoneCapture.incomingCall(notice, true));
        notice.category = Notification.CATEGORY_CALL;
        assertTrue(PhoneCapture.incomingCall(notice, true));
        notice.extras.putInt(Notification.EXTRA_CALL_TYPE, Notification.CallStyle.CALL_TYPE_ONGOING);
        assertFalse(PhoneCapture.incomingCall(notice, true));
        PhoneCapture.Ringing ringing = new PhoneCapture.Ringing();
        JSONObject whatsapp = ringing.notification("app", "Incoming Call", true);
        assertEquals("WhatsApp", whatsapp.optString("source"));
        assertEquals(whatsapp.optString("id"), ringing.snapshot().optString("id"));
        assertEquals("", ringing.mobile(true).optString("source"));
        assertEquals("WhatsApp", ringing.mobile(false).optString("source"));
        assertEquals("", ringing.notification("app", null).optString("id"));
        ringing.notification("missing-end", "Incoming Call", true, 10);
        assertEquals(10, ringing.nextExpiry());
        assertNull(ringing.prune(9));
        assertEquals("", ringing.prune(10).optString("id"));
    }

    private final Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();

    private PhoneState receiver() {
        Context isolated = new ContextWrapper(app) {
            @Override
            public SharedPreferences getSharedPreferences(String name, int mode) {
                return app.getSharedPreferences("instrumentation_" + name, mode);
            }
        };
        PhoneState state = new PhoneState(isolated);
        state.connected = true;
        return state;
    }

    @Test
    public void orderedFramesRejectReplayAndOversize() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        new LinkWire(new ByteArrayInputStream(new byte[0]), bytes).write(object("type", "ping"));
        byte[] first = bytes.toByteArray();
        bytes.write(first);
        LinkWire reader = new LinkWire(new ByteArrayInputStream(bytes.toByteArray()), bytes);
        assertEquals("ping", reader.read().getString("type"));
        try {
            reader.read();
            fail("Accepted repeated sequence");
        } catch (IOException expected) {}
        bytes.reset();
        new DataOutputStream(bytes).writeInt(1000000);
        try {
            new LinkWire(new ByteArrayInputStream(bytes.toByteArray()), bytes).read();
            fail("Accepted oversized frame");
        } catch (IOException expected) {}
    }

    @Test
    public void notificationPrivacyIsOptInAndRedactsCodes() {
        assertTrue(PhoneCapture.publicPreview(true, Notification.VISIBILITY_PUBLIC, "Calendar", "Lunch"));
        assertFalse(PhoneCapture.publicPreview(false, Notification.VISIBILITY_PUBLIC, "Calendar", "Lunch"));
        assertFalse(PhoneCapture.publicPreview(true, Notification.VISIBILITY_SECRET, "Calendar", "Lunch"));
        assertFalse(PhoneCapture.publicPreview(true, Notification.VISIBILITY_PRIVATE, "Calendar", "Lunch"));
        assertFalse(
            PhoneCapture.publicPreview(true, Notification.VISIBILITY_PUBLIC, "Sign in", "Your code is 123456")
        );
    }

    private static JSONObject note(String id, String text) {
        return object("type", "note", "id", id, "row", object("id", id, "title", "Test", "text", text, "time", 1));
    }

    @Test
    public void receiverMergesBoundsAndClearsInboxAndCalls() {
        PhoneState state = receiver();
        state.receive(note("a", "first"));
        long revision = state.revision;
        state.receive(note("a", "first"));
        assertEquals(revision, state.revision);
        state.receive(note("a", "update"));
        assertEquals(1, state.inbox.size());
        assertEquals("update", state.inbox.get("a").optString("text"));
        state.receive(object("type", "remove", "id", "a"));
        assertTrue(state.inbox.isEmpty());
        for (int i = 0; i < 60; i++) state.receive(note("row" + i, "notification"));
        assertEquals(40, state.inbox.size());
        state.receive(object("type", "call", "id", "episode", "label", "Incoming Call"));
        state.receive(note("priority", "later"));
        assertEquals("", state.banner);
        assertEquals("episode", state.callId);
        state.receive(object("type", "call", "id", "", "label", ""));
        assertEquals("", state.callId);
        state.clearRemote();
        assertTrue(state.inbox.isEmpty());
        assertFalse(state.connected);
        state.receive(note("late", "after stop"));
        assertTrue(state.inbox.isEmpty());
        state.schedulePrune();
    }

    @Test
    public void telephonyAndCallStyleShareOneEpisode() throws Exception {
        PhoneCapture.Ringing ringing = new PhoneCapture.Ringing();
        JSONObject initial = ringing.mobile(true);
        assertEquals("Incoming Call", initial.getString("label"));
        assertNull(ringing.mobile(true));
        assertEquals(initial.getString("id"), ringing.notification("dialer", "Public caller").getString("id"));
        assertEquals(initial.getString("id"), ringing.notification("dialer", null).getString("id"));
        assertEquals("", ringing.mobile(false).getString("id"));
        JSONObject appCall = ringing.notification("app", "Incoming Call");
        assertNotEquals(initial.getString("id"), appCall.getString("id"));
        assertNull(ringing.mobile(true));
        assertEquals("", ringing.mobile(false).getString("label"));
        assertNull(ringing.notification("app", null));
    }

    @Test
    public void missingAcknowledgementTimesOut() throws Exception {
        PhoneState state = receiver();
        state.transport = new PhoneTransport(state, "");
        CountDownLatch timeout = new CountDownLatch(1);
        state.changed = () -> {
            if (state.commandResult.equals("Command timed out")) timeout.countDown();
        };
        state.main.post(() -> state.command("next", 0));
        assertTrue(timeout.await(8, TimeUnit.SECONDS));
        assertEquals("", state.pendingCommand);
    }

    @Test
    public void realAndroidSessionReceivesSupportedCommands() throws Exception {
        MediaSession session = new MediaSession(app, "Standby instrumentation");
        BlockingQueue<String> received = new LinkedBlockingQueue<>();
        try {
            session.setCallback(
                new MediaSession.Callback() {
                    @Override
                    public void onPlay() {
                        received.add("play");
                    }

                    @Override
                    public void onPause() {
                        received.add("pause");
                    }

                    @Override
                    public void onSkipToPrevious() {
                        received.add("previous");
                    }

                    @Override
                    public void onSkipToNext() {
                        received.add("next");
                    }

                    @Override
                    public void onSeekTo(long pos) {
                        received.add("seek" + pos);
                    }
                },
                new Handler(Looper.getMainLooper())
            );
            long actions =
                PlaybackState.ACTION_PLAY |
                PlaybackState.ACTION_PAUSE |
                PlaybackState.ACTION_SKIP_TO_NEXT |
                PlaybackState.ACTION_SKIP_TO_PREVIOUS |
                PlaybackState.ACTION_SEEK_TO;
            PlaybackState paused = new PlaybackState.Builder()
                .setState(PlaybackState.STATE_PAUSED, 1000, 0)
                .setActions(actions)
                .build();
            session.setPlaybackState(paused);
            MediaMetadata data = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, "Test track")
                .putString(MediaMetadata.METADATA_KEY_ARTIST, "Test artist")
                .putLong(MediaMetadata.METADATA_KEY_DURATION, 60000)
                .build();
            session.setMetadata(data);
            session.setActive(true);
            MediaController controller = session.getController();
            JSONObject media = PhoneCapture.mediaSnapshot(
                controller.getMetadata(),
                controller.getPlaybackState(),
                "test",
                false
            );
            assertEquals("Test track", media.getString("title"));
            assertFalse(media.getBoolean("playing"));
            for (String action : new String[] { "play", "pause", "previous", "next", "seek" }) {
                assertEquals(
                    "Sent to Spotify",
                    PhoneCapture.dispatch(controller, object("action", action, "position", 2000))
                );
                assertEquals(action.equals("seek") ? "seek2000" : action, received.poll(3, TimeUnit.SECONDS));
            }
            assertEquals(
                "Control unsupported",
                PhoneCapture.dispatch(controller, object("action", "seek", "position", 999999))
            );
            session.setPlaybackState(
                new PlaybackState.Builder().setState(PlaybackState.STATE_PLAYING, 2000, 1).setActions(0).build()
            );
            assertTrue(
                PhoneCapture.mediaSnapshot(data, controller.getPlaybackState(), "test", false).getBoolean(
                    "playing"
                )
            );
            assertEquals("Control unsupported", PhoneCapture.dispatch(controller, object("action", "next")));
            Bitmap art = Bitmap.createBitmap(300, 400, Bitmap.Config.ARGB_8888);
            assertTrue(PhoneCapture.image(art, 176).startsWith("data:image/png;base64,"));
            assertEquals("", PhoneCapture.image(null, 176));
            art.recycle();
        } finally {
            session.release();
        }
    }
}
