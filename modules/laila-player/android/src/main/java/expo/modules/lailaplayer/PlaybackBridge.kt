package expo.modules.lailaplayer

import android.net.Uri
import java.util.concurrent.ConcurrentHashMap

/**
 * Process-wide state shared by [LailaPlayerModule] (JS side) and
 * [LailaPlaybackService] (player side). Both live in the app process, so a
 * plain object is enough; no IPC, no persistence.
 *
 * Header values carry credentials for reverse proxies. They are kept only in
 * memory, replaced on every queue change and never logged.
 */
internal object PlaybackBridge {
  interface RemoteListener {
    fun onRemoteNext()
    fun onRemotePrevious()
  }

  private val headers = ConcurrentHashMap<String, Map<String, String>>()

  /** When true, the service pauses on a natural track change and lets JS decide. */
  @Volatile var pauseOnAutoAdvance = false

  /** When set, next/previous from notification, lock screen or headset go to JS. */
  @Volatile var remoteListener: RemoteListener? = null

  fun replaceHeaders(next: Map<String, Map<String, String>>) {
    headers.keys.retainAll(next.keys)
    headers.putAll(next)
  }

  fun headersFor(uri: Uri): Map<String, String> = headers[uri.toString()] ?: emptyMap()

  fun clear() {
    headers.clear()
    pauseOnAutoAdvance = false
    remoteListener = null
  }

  /** Returns true when JS handled the press; false falls back to the native queue. */
  fun remoteNext(): Boolean = remoteListener?.let { it.onRemoteNext(); true } ?: false

  fun remotePrevious(): Boolean = remoteListener?.let { it.onRemotePrevious(); true } ?: false
}
