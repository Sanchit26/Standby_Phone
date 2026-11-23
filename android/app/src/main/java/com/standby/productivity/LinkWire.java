package com.standby.productivity;

import java.io.*;
import java.nio.charset.StandardCharsets;
import org.json.*;

/** Each TLS connection starts fresh, with independent ordered counters in both directions. */
final class LinkWire {

    private static final int MAX_BYTES = 384 * 1024;
    private final DataInputStream input;
    private final DataOutputStream output;
    private long sent, received;

    LinkWire(InputStream in, OutputStream out) {
        input = new DataInputStream(new BufferedInputStream(in));
        output = new DataOutputStream(new BufferedOutputStream(out));
    }

    static JSONObject object(Object... pairs) {
        JSONObject json = new JSONObject();
        try {
            for (int i = 0; i < pairs.length; i += 2) json.put((String) pairs[i], pairs[i + 1]);
        } catch (JSONException e) {
            throw new IllegalArgumentException(e);
        }
        return json;
    }

    synchronized void write(JSONObject payload) throws Exception {
        byte[] bytes = object("v", 1, "seq", ++sent, "data", payload).toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BYTES) throw new IOException("Frame too large");
        output.writeInt(bytes.length);
        output.write(bytes);
        output.flush();
    }

    JSONObject read() throws Exception {
        int length = input.readInt();
        if (length <= 0 || length > MAX_BYTES) throw new IOException("Invalid frame");
        byte[] data = new byte[length];
        input.readFully(data);
        JSONObject frame = new JSONObject(new String(data, StandardCharsets.UTF_8));
        if (frame.getInt("v") != 1 || frame.getLong("seq") != received + 1) throw new IOException(
            "Invalid sequence"
        );
        received++;
        return frame.getJSONObject("data");
    }
}
