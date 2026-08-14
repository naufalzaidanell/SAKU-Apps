package com.saku.umkm

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureSessionStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (store.containsAlias(KEY_ALIAS)) {
            return (store.getEntry(KEY_ALIAS, null) as KeyStore.SecretKeyEntry).secretKey
        }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return generator.generateKey()
    }

    @Synchronized fun save(refreshToken: String) {
        saveEncrypted(VALUE, refreshToken)
    }

    @Synchronized fun savePendingRevocation(refreshToken: String) {
        saveEncrypted(PENDING_REVOCATION, refreshToken)
    }

    private fun saveEncrypted(preferenceKey: String, refreshToken: String) {
        require(refreshToken.length >= 20) { "INVALID_REFRESH_TOKEN" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(refreshToken.toByteArray(StandardCharsets.UTF_8))
        val payload = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP)
        prefs.edit().putString(preferenceKey, payload).apply()
    }

    @Synchronized fun load(): String? {
        return loadEncrypted(VALUE) { clear() }
    }

    @Synchronized fun loadPendingRevocation(): String? {
        return loadEncrypted(PENDING_REVOCATION) { clearPendingRevocation() }
    }

    private fun loadEncrypted(preferenceKey: String, onCorrupt: () -> Unit): String? {
        val payload = prefs.getString(preferenceKey, null) ?: return null
        return runCatching {
            val parts = payload.split(":", limit = 2)
            require(parts.size == 2)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
            String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8)
        }.getOrElse { onCorrupt(); null }
    }

    @Synchronized fun clear() { prefs.edit().remove(VALUE).apply() }
    @Synchronized fun clearPendingRevocation() { prefs.edit().remove(PENDING_REVOCATION).apply() }

    companion object {
        private const val KEY_ALIAS = "saku_refresh_token_v1"
        private const val PREFS = "saku_secure_session"
        private const val VALUE = "refresh_token"
        private const val PENDING_REVOCATION = "pending_refresh_token_revocation"
    }
}
