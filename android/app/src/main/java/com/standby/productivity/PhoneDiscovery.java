package com.standby.productivity;

import android.content.Context;
import android.net.nsd.*;

/** DNS-SD advertises a public identity hint. TLS independently authenticates the endpoint. */
final class PhoneDiscovery {

    private final NsdManager nsd;
    private NsdManager.RegistrationListener registration;
    private NsdManager.DiscoveryListener discovery;
    volatile String host = "";
    private volatile boolean stopped;
    private static final String TYPE = "_standby-link._tcp.";

    PhoneDiscovery(Context context) {
        nsd = context.getSystemService(NsdManager.class);
    }

    void advertise(String pin, int port) {
        NsdServiceInfo info = new NsdServiceInfo();
        info.setServiceName("Standby-" + pin.substring(0, 12));
        info.setServiceType(TYPE);
        info.setPort(port);
        registration = new NsdManager.RegistrationListener() {
            public void onServiceRegistered(NsdServiceInfo i) {}

            public void onServiceUnregistered(NsdServiceInfo i) {}

            public void onRegistrationFailed(NsdServiceInfo i, int e) {}

            public void onUnregistrationFailed(NsdServiceInfo i, int e) {}
        };
        nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, registration);
    }

    void search(String pin) {
        discovery = new NsdManager.DiscoveryListener() {
            public void onDiscoveryStarted(String t) {}

            public void onDiscoveryStopped(String t) {}

            public void onStartDiscoveryFailed(String t, int e) {}

            public void onStopDiscoveryFailed(String t, int e) {}

            public void onServiceLost(NsdServiceInfo i) {
                if (matches(i)) host = "";
            }

            private boolean matches(NsdServiceInfo i) {
                return i.getServiceName().startsWith("Standby-" + pin.substring(0, 12));
            }

            public void onServiceFound(NsdServiceInfo i) {
                if (stopped || !matches(i)) return;
                nsd.resolveService(
                    i,
                    new NsdManager.ResolveListener() {
                        public void onResolveFailed(NsdServiceInfo s, int e) {}

                        public void onServiceResolved(NsdServiceInfo s) {
                            if (
                                !stopped && s.getHost() != null && s.getHost() instanceof java.net.Inet4Address
                            ) host = s.getHost().getHostAddress();
                        }
                    }
                );
            }
        };
        nsd.discoverServices(TYPE, NsdManager.PROTOCOL_DNS_SD, discovery);
    }

    void close() {
        stopped = true;
        try {
            if (registration != null) nsd.unregisterService(registration);
        } catch (RuntimeException ignored) {}
        try {
            if (discovery != null) nsd.stopServiceDiscovery(discovery);
        } catch (RuntimeException ignored) {}
    }
}
