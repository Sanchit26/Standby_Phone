package com.standby.productivity;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.net.Socket;
import java.security.*;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.security.spec.ECGenParameterSpec;
import java.util.Date;
import javax.net.ssl.*;
import javax.security.auth.x500.X500Principal;

/** TLS proves possession of each non-exportable EC key. Only public certificate pins are saved. */
final class PeerIdentity {

    private static final String ALIAS = "StandbyPhoneLinkTlsV1";
    final PrivateKey key;
    final X509Certificate cert;

    PeerIdentity() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC", "AndroidKeyStore");
            generator.initialize(
                new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY)
                    .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                    // Conscrypt supplies the prehashed TLS handshake to the Keystore EC signer.
                    .setDigests(
                        KeyProperties.DIGEST_NONE,
                        KeyProperties.DIGEST_SHA256,
                        KeyProperties.DIGEST_SHA384,
                        KeyProperties.DIGEST_SHA512
                    )
                    .setCertificateSubject(new X500Principal("CN=Standby device"))
                    .setCertificateNotAfter(new Date(System.currentTimeMillis() + 20L * 365 * 86400000))
                    .build()
            );
            generator.generateKeyPair();
        }
        key = (PrivateKey) store.getKey(ALIAS, null);
        cert = (X509Certificate) store.getCertificate(ALIAS);
    }

    static String pin(X509Certificate cert) throws GeneralSecurityException {
        return Base64.encodeToString(
            MessageDigest.getInstance("SHA-256").digest(cert.getEncoded()),
            Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING
        );
    }

    SSLContext tls(String expected, boolean enrollClient) throws Exception {
        X509TrustManager trust = new X509TrustManager() {
            public X509Certificate[] getAcceptedIssuers() {
                return new X509Certificate[0];
            }

            private void verify(X509Certificate[] chain, boolean enrollment) throws CertificateException {
                if (chain == null || chain.length != 1) throw new CertificateException(
                    "Unexpected certificate chain"
                );
                try {
                    chain[0].checkValidity();
                    chain[0].verify(chain[0].getPublicKey());
                    if (!enrollment && !pin(chain[0]).equals(expected)) throw new CertificateException(
                        "Peer changed"
                    );
                } catch (GeneralSecurityException e) {
                    throw new CertificateException(e);
                }
            }

            public void checkServerTrusted(X509Certificate[] chain, String auth) throws CertificateException {
                verify(chain, false);
            }

            public void checkClientTrusted(X509Certificate[] chain, String auth) throws CertificateException {
                verify(chain, enrollClient);
            }
        };
        X509KeyManager keys = new X509KeyManager() {
            public String chooseClientAlias(String[] types, Principal[] issuers, Socket s) {
                return ALIAS;
            }

            public String chooseServerAlias(String type, Principal[] issuers, Socket s) {
                return "EC".equals(type) ? ALIAS : null;
            }

            public String[] getClientAliases(String type, Principal[] issuers) {
                return new String[] { ALIAS };
            }

            public String[] getServerAliases(String type, Principal[] issuers) {
                return new String[] { ALIAS };
            }

            public PrivateKey getPrivateKey(String alias) {
                return key;
            }

            public X509Certificate[] getCertificateChain(String alias) {
                return new X509Certificate[] { cert };
            }
        };
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(new KeyManager[] { keys }, new TrustManager[] { trust }, null);
        return ctx;
    }
}
