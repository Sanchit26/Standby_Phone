package com.standby.productivity;

import static com.standby.productivity.LinkWire.object;

import android.net.*;
import android.os.SystemClock;
import java.io.*;
import java.net.*;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.*;
import java.util.concurrent.*;
import javax.net.ssl.*;
import org.json.JSONObject;

final class PhoneTransport implements Runnable {

    static final int PORT = 41673;
    private final PhoneState state;
    private final boolean sender;
    private final String offer;
    private final ConnectivityManager networks;
    private final ArrayBlockingQueue<JSONObject> queue = new ArrayBlockingQueue<>(64);
    private final Thread worker;
    private volatile boolean closed, online;
    private volatile long epoch;
    private volatile Socket current;
    private volatile ServerSocket server;
    private volatile String challenge = "",
        pendingId = "";
    private volatile long expires;
    private volatile CountDownLatch approval;
    private PhoneDiscovery discovery;
    private String approved = "";
    private Network activeNetwork;
    private final ConnectivityManager.NetworkCallback networkChanges = new ConnectivityManager.NetworkCallback() {
        @Override
        public void onLost(Network network) {
            synchronized (PhoneTransport.this) {
                if (network.equals(activeNetwork)) closeSockets();
            }
        }
    };

    PhoneTransport(PhoneState state, String offer) {
        this.state = state;
        this.offer = offer;
        sender = state.sender();
        networks = state.context.getSystemService(ConnectivityManager.class);
        worker = new Thread(this, "Standby Wi-Fi");
    }

    void start() {
        worker.start();
    }

    private void ui(Runnable action) {
        state.main.post(() -> {
            if (!closed && state.transport == this) action.run();
        });
    }

    private void status(String value) {
        ui(() -> {
            state.status = value;
            state.publish();
        });
    }

    synchronized void approve(String id) {
        if (!id.isEmpty() && id.equals(pendingId) && approval != null && SystemClock.elapsedRealtime() < expires) {
            approved = id;
            approval.countDown();
        }
    }

    void send(JSONObject msg) {
        if (online && !queue.offer(msg)) closeSocket(current);
    }

    private static void closeSocket(Closeable socket) {
        if (socket != null) try {
            socket.close();
        } catch (IOException ignored) {}
    }

    private void closeSockets() {
        closeSocket(current);
        closeSocket(server);
    }

    synchronized void close() {
        closed = true;
        online = false;
        closeSockets();
        if (approval != null) approval.countDown();
        worker.interrupt();
    }

    private Network wifi() throws IOException {
        Network preferred = networks.getActiveNetwork();
        NetworkCapabilities preferredCaps = preferred == null ? null : networks.getNetworkCapabilities(preferred);
        if (preferredCaps != null && preferredCaps.hasTransport(NetworkCapabilities.TRANSPORT_VPN))
            throw new IOException("Pause the VPN to reach the paired phone over Wi-Fi");
        if (hasWifiAddress(preferred)) return preferred;
        // LAN connectivity can return before Android switches its default route away from cellular.
        for (Network candidate : networks.getAllNetworks()) if (hasWifiAddress(candidate)) return candidate;
        throw new IOException("Connect both phones to home Wi-Fi");
    }

    private boolean hasWifiAddress(Network network) {
        if (network == null) return false;
        NetworkCapabilities caps = networks.getNetworkCapabilities(network);
        if (caps == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return false;
        LinkProperties properties = networks.getLinkProperties(network);
        return properties != null && properties.getLinkAddresses().stream()
            .anyMatch(address -> address.getAddress() instanceof Inet4Address);
    }

    @Override
    public void run() {
        try {
            networks.registerNetworkCallback(
                new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(),
                networkChanges
            );
            PeerIdentity identity = new PeerIdentity();
            String own = PeerIdentity.pin(identity.cert);
            if (!sender && !state.prefs.contains("peer")) {
                challenge = String.format(Locale.ROOT, "%08d", new SecureRandom().nextInt(100000000));
                expires = SystemClock.elapsedRealtime() + 120000;
                ui(() -> {
                    state.code = own + "." + challenge;
                    state.codeUntil = expires;
                    state.publish();
                });
                state.main.postDelayed(
                    () -> {
                        if (state.transport == this) state.publish();
                    },
                    120100
                );
            }
            String expected = state.prefs.getString("peer", "");
            if (sender && expected.isEmpty()) {
                if (!offer.matches("[A-Za-z0-9_-]{43}\\.[0-9]{8}")) throw new IOException(
                    "Enter the receiver pairing code"
                );
                expected = offer.substring(0, 43);
            }
            discovery = new PhoneDiscovery(state.context);
            try {
                if (sender) discovery.search(expected);
                else discovery.advertise(own, PORT);
            } catch (RuntimeException ignored) {}
            int delay = 1;
            while (!closed) {
                try {
                    Network n = wifi();
                    synchronized (this) {
                        activeNetwork = n;
                    }
                    LinkProperties p = networks.getLinkProperties(n);
                    if (p == null) throw new IOException("Wi-Fi unavailable");
                    LinkAddress local = null;
                    for (LinkAddress a : p.getLinkAddresses())
                        if (a.getAddress() instanceof Inet4Address) {
                            local = a;
                            break;
                        }
                    if (local == null) throw new IOException("Wi-Fi IPv4 address unavailable");
                    String address = local.getAddress().getHostAddress();
                    ui(() -> {
                        state.address = address;
                        state.publish();
                    });
                    Socket raw;
                    if (sender) {
                        String manual = state.prefs.getString("host", "");
                        String host = manual.isEmpty() ? discovery.host : manual;
                        if (!host.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")) throw new IOException(
                            "Searching Wi-Fi. Enter the receiver IPv4 address if needed"
                        );
                        String[] octets = host.split("\\.");
                        byte[] ipv4 = new byte[4];
                        for (int i = 0; i < ipv4.length; i++) {
                            int octet = Integer.parseInt(octets[i]);
                            if (octet > 255) throw new IOException("Enter a valid receiver IPv4 address");
                            ipv4[i] = (byte) octet;
                        }
                        InetAddress target = InetAddress.getByAddress(ipv4);
                        boolean onLink = false;
                        for (RouteInfo route : p.getRoutes()) {
                            InetAddress gateway = route.getGateway();
                            if (
                                !route.isDefaultRoute() &&
                                (gateway == null || gateway.isAnyLocalAddress()) &&
                                route.matches(target)
                            ) onLink = true;
                        }
                        if (!onLink) throw new IOException("Receiver must be on the same Wi-Fi subnet");
                        raw = n.getSocketFactory().createSocket();
                        current = raw;
                        raw.connect(new InetSocketAddress(target, PORT), 5000);
                    } else {
                        ServerSocket listener = new ServerSocket();
                        server = listener;
                        if (closed) break;
                        listener.setReuseAddress(true);
                        listener.bind(new InetSocketAddress(local.getAddress(), PORT), 3);
                        status("Listening on home Wi-Fi");
                        raw = listener.accept();
                        current = raw;
                    }
                    if (closed) break;
                    exchange(identity, expected, raw);
                    delay = 1;
                } catch (Exception error) {
                    if (!closed) status(
                        error.getClass() == IOException.class && error.getMessage() != null
                            ? error.getMessage()
                            : "Link interrupted. Check pairing, Wi-Fi and client isolation"
                    );
                } finally {
                    online = false;
                    epoch++;
                    closeSockets();
                    queue.clear();
                    ui(() -> {
                        state.clearRemote();
                        state.candidate = "";
                        if (sender && PhoneService.live != null) PhoneService.live.capture.disconnect();
                        state.publish();
                    });
                }
                if (!closed) {
                    Thread.sleep(delay * 1000L);
                    delay = Math.min(sender ? 15 : 2, delay * 2);
                }
            }
        } catch (Exception e) {
            if (!closed) status("Could not start phone link. Check pairing code, permissions and Wi-Fi");
        } finally {
            closeSockets();
            if (discovery != null) discovery.close();
            try {
                networks.unregisterNetworkCallback(networkChanges);
            } catch (RuntimeException ignored) {}
        }
    }

    private void exchange(PeerIdentity identity, String expected, Socket raw) throws Exception {
        String saved = state.prefs.getString("peer", "");
        boolean enrollment = saved.isEmpty();
        raw.setSoTimeout(10000);
        try (
            SSLSocket tls = (SSLSocket) identity
                .tls(
                    sender && enrollment ? expected : saved,
                    !sender && enrollment && SystemClock.elapsedRealtime() < expires
                )
                .getSocketFactory()
                .createSocket(raw, raw.getInetAddress().getHostAddress(), PORT, true)
        ) {
            tls.setUseClientMode(sender);
            if (!sender) tls.setNeedClientAuth(true);
            tls.setEnabledProtocols(new String[] { "TLSv1.2" });
            tls.setEnabledCipherSuites(new String[] { "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256" });
            tls.startHandshake();
            String peer = PeerIdentity.pin((X509Certificate) tls.getSession().getPeerCertificates()[0]);
            LinkWire wire = new LinkWire(tls.getInputStream(), tls.getOutputStream());
            String peerName;
            if (sender) {
                wire.write(
                    object(
                        "type",
                        "hello",
                        "name",
                        state.name(),
                        "challenge",
                        enrollment ? offer.substring(44) : ""
                    )
                );
                tls.setSoTimeout(125000);
                JSONObject reply = wire.read();
                if (!reply.optString("type").equals("accepted")) throw new IOException(
                    "Pairing declined or expired"
                );
                peerName = reply.optString("name");
            } else {
                JSONObject hello = wire.read();
                if (!hello.optString("type").equals("hello")) throw new IOException("Incompatible device");
                peerName = hello.optString("name");
                if (enrollment) {
                    if (
                        challenge.isEmpty() ||
                        !challenge.equals(hello.optString("challenge")) ||
                        SystemClock.elapsedRealtime() >= expires
                    ) throw new IOException("Pairing code incorrect or expired");
                    String id = UUID.randomUUID().toString();
                    CountDownLatch wait = new CountDownLatch(1);
                    synchronized (this) {
                        pendingId = id;
                        approval = wait;
                        approved = "";
                    }
                    String label = peerName.substring(0, Math.min(48, peerName.length()));
                    ui(() -> {
                        state.candidate = id;
                        state.peerName = label;
                        state.status = "Approve " + label;
                        state.publish();
                    });
                    wait.await(Math.max(0, expires - SystemClock.elapsedRealtime()), TimeUnit.MILLISECONDS);
                    synchronized (this) {
                        if (closed || !approved.equals(id)) throw new IOException("Approval expired");
                    }
                }
            }
            synchronized (this) {
                if (closed) throw new IOException("Stopped");
                state.prefs
                    .edit()
                    .putString("peer", peer)
                    .putString("peerName", peerName.substring(0, Math.min(48, peerName.length())))
                    .apply();
                challenge = "";
                pendingId = "";
                approval = null;
            }
            if (!sender) wire.write(object("type", "accepted", "name", state.name()));
            tls.setSoTimeout(35000);
            queue.clear();
            online = true;
            long sessionEpoch = ++epoch;
            Semaphore inbound = new Semaphore(16);
            ui(() -> {
                state.candidate = "";
                state.code = "";
                state.connected = true;
                state.status = "Connected";
                state.publish();
                if (sender) PhoneCapture.resync(state);
            });
            Thread writer = new Thread(
                () -> {
                    try {
                        while (!closed && !tls.isClosed()) {
                            JSONObject next = queue.poll(12, TimeUnit.SECONDS);
                            wire.write(next == null ? object("type", "ping") : next);
                        }
                    } catch (Exception ignored) {
                        closeSocket(tls);
                    }
                },
                "Standby TLS writer"
            );
            writer.start();
            try {
                while (!closed) {
                    JSONObject msg = wire.read();
                    if (!msg.optString("type").equals("ping")) {
                        inbound.acquire();
                        state.main.post(() -> {
                            try {
                                if (!closed && epoch == sessionEpoch && state.transport == this) state.receive(
                                    msg
                                );
                            } finally {
                                inbound.release();
                            }
                        });
                    }
                }
            } finally {
                online = false;
                writer.interrupt();
                closeSocket(raw);
                writer.join(1200);
            }
        }
    }
}
