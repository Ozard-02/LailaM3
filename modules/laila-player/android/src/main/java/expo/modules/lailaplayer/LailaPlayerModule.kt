package expo.modules.lailaplayer

import android.content.ComponentName
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

private const val BUFFER_TICK_MS = 1000L
private val SECRET_PARAM = Regex("""([?&](?:t|s|p|u|apiKey|token)=)[^&\s]*""", RegexOption.IGNORE_CASE)

class QueueItem : Record {
  @Field val id: String = ""
  @Field val url: String = ""
  @Field val headers: Map<String, String>? = null
  @Field val title: String = ""
  @Field val artist: String? = null
  @Field val album: String? = null
  @Field val artwork: String? = null
  @Field val artworkHeaders: Map<String, String>? = null
  @Field val duration: Double? = null
  @Field val mimeType: String? = null
}

/**
 * Immutable player snapshot. Written on the main thread, read from the JS
 * thread by the synchronous `getSnapshot`, so polling never crosses threads.
 * Position is extrapolated from the last event instead of ticking natively.
 */
private data class Snapshot(
  val state: String = "idle",
  val playing: Boolean = false,
  val positionMs: Long = 0,
  val atRealtimeMs: Long = 0,
  val speed: Float = 1f,
  val durationMs: Long = 0,
  val bufferedMs: Long = 0,
  val error: String? = null,
) {
  fun toMap(now: Long = SystemClock.elapsedRealtime()): Map<String, Any?> {
    var position = positionMs
    if (playing) position += ((now - atRealtimeMs) * speed).toLong()
    if (durationMs > 0) position = position.coerceAtMost(durationMs)
    return mapOf(
      "state" to state,
      "playing" to playing,
      "position" to position / 1000.0,
      "duration" to durationMs / 1000.0,
      "buffered" to bufferedMs / 1000.0,
      "error" to error,
    )
  }
}

class LailaPlayerModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var controllerFuture: ListenableFuture<MediaController>? = null
  private var controller: MediaController? = null
  private val pendingSetup = mutableListOf<Promise>()

  @Volatile private var snapshot = Snapshot()

  private val bufferTick =
    object : Runnable {
      override fun run() {
        val c = controller ?: return
        refresh(c, emit = false)
        if (c.isLoading) main.postDelayed(this, BUFFER_TICK_MS)
      }
    }

  private val playerListener =
    object : Player.Listener {
      override fun onEvents(player: Player, events: Player.Events) {
        (player as? MediaController)?.let { refresh(it, emit = true) }
        if (events.contains(Player.EVENT_IS_LOADING_CHANGED) && player.isLoading) {
          main.removeCallbacks(bufferTick)
          main.postDelayed(bufferTick, BUFFER_TICK_MS)
        }
      }

      override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
        if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
          sendEvent("onAutoAdvance", mapOf("mediaId" to mediaItem?.mediaId))
        }
      }

      override fun onPlayerError(error: PlaybackException) {
        sendEvent("onError", mapOf("code" to error.errorCodeName, "message" to describe(error)))
      }
    }

  private val remoteListener =
    object : PlaybackBridge.RemoteListener {
      override fun onRemoteNext() = sendEvent("onRemoteNext", Bundle.EMPTY)

      override fun onRemotePrevious() = sendEvent("onRemotePrevious", Bundle.EMPTY)
    }

  override fun definition() = ModuleDefinition {
    Name("LailaPlayer")

    Events("onState", "onAutoAdvance", "onRemoteNext", "onRemotePrevious", "onError")

    AsyncFunction("setup") { promise: Promise -> connect(promise) }.runOnQueue(Queues.MAIN)

    AsyncFunction("setQueue") { items: List<QueueItem>, startIndex: Int ->
      val c = requireController()
      if (items.isEmpty()) return@AsyncFunction
      PlaybackBridge.replaceHeaders(headerMap(items))
      val index = startIndex.coerceIn(0, items.size - 1)
      c.setMediaItems(items.map(::toMediaItem), index, 0L)
      c.prepare()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("removeQueueItem") { index: Int, mediaId: String ->
      val c = controller ?: return@AsyncFunction
      if (index !in 0 until c.mediaItemCount) return@AsyncFunction
      if (c.getMediaItemAt(index).mediaId != mediaId) return@AsyncFunction
      c.removeMediaItem(index)
      refresh(c, emit = true)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("play") { requireController().play() }.runOnQueue(Queues.MAIN)

    AsyncFunction("pause") { requireController().pause() }.runOnQueue(Queues.MAIN)

    AsyncFunction("seekTo") { seconds: Double ->
      // Before setup this is a no-op, like the previous engine.
      controller?.let {
        it.seekTo((seconds.coerceAtLeast(0.0) * 1000).toLong())
        refresh(it, emit = true)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setVolume") { volume: Double ->
      controller?.volume = volume.coerceIn(0.0, 1.0).toFloat()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setPauseOnAutoAdvance") { enabled: Boolean ->
      PlaybackBridge.pauseOnAutoAdvance = enabled
    }

    AsyncFunction("setRemoteHandling") { enabled: Boolean ->
      PlaybackBridge.remoteListener = if (enabled) remoteListener else null
    }

    Function("getSnapshot") { snapshot.toMap() }

    AsyncFunction("destroy") { release(stopPlayback = true) }.runOnQueue(Queues.MAIN)

    OnDestroy { main.post { release(stopPlayback = false) } }
  }

  private fun connect(promise: Promise) {
    if (controller != null) {
      promise.resolve(null)
      return
    }
    pendingSetup += promise
    if (controllerFuture != null) return

    val context = appContext.reactContext?.applicationContext
    if (context == null) {
      failSetup("ERR_LAILA_PLAYER_CONTEXT", "Android context unavailable", null)
      return
    }
    val token = SessionToken(context, ComponentName(context, LailaPlaybackService::class.java))
    val future = MediaController.Builder(context, token).buildAsync()
    controllerFuture = future
    future.addListener(
      {
        try {
          val c = future.get()
          controller = c
          c.addListener(playerListener)
          refresh(c, emit = true)
          pendingSetup.forEach { it.resolve(null) }
          pendingSetup.clear()
        } catch (e: Exception) {
          controllerFuture = null
          failSetup("ERR_LAILA_PLAYER_CONNECT", "Could not connect to the playback service", e)
        }
      },
      ContextCompat.getMainExecutor(context),
    )
  }

  private fun failSetup(code: String, message: String, cause: Throwable?) {
    pendingSetup.forEach { it.reject(code, message, cause) }
    pendingSetup.clear()
  }

  private fun requireController(): MediaController =
    controller ?: throw IllegalStateException("LailaPlayer.setup() has not completed")

  private fun refresh(c: MediaController, emit: Boolean) {
    val next =
      Snapshot(
        state =
          when (c.playbackState) {
            Player.STATE_BUFFERING -> "buffering"
            Player.STATE_READY -> "ready"
            Player.STATE_ENDED -> "ended"
            else -> "idle"
          },
        playing = c.isPlaying,
        positionMs = c.currentPosition.coerceAtLeast(0),
        atRealtimeMs = SystemClock.elapsedRealtime(),
        speed = c.playbackParameters.speed,
        durationMs = c.duration.takeIf { it != C.TIME_UNSET }?.coerceAtLeast(0) ?: 0,
        bufferedMs = c.bufferedPosition.coerceAtLeast(0),
        error = c.playerError?.let(::describe),
      )
    val changed = next.copy(positionMs = 0, atRealtimeMs = 0, bufferedMs = 0) !=
      snapshot.copy(positionMs = 0, atRealtimeMs = 0, bufferedMs = 0)
    snapshot = next
    if (emit && changed) sendEvent("onState", next.toMap())
  }

  private fun release(stopPlayback: Boolean) {
    main.removeCallbacks(bufferTick)
    controller?.let {
      it.removeListener(playerListener)
      if (stopPlayback) it.stop()
      it.release()
    }
    controller = null
    controllerFuture?.let { MediaController.releaseFuture(it) }
    controllerFuture = null
    if (PlaybackBridge.remoteListener === remoteListener) PlaybackBridge.remoteListener = null
    if (stopPlayback) PlaybackBridge.clear()
    snapshot = Snapshot()
  }
}

private fun headerMap(items: List<QueueItem>): Map<String, Map<String, String>> {
  val out = HashMap<String, Map<String, String>>()
  for (item in items) {
    item.headers?.takeIf { it.isNotEmpty() }?.let { out[item.url] = it }
    val art = item.artwork
    val artHeaders = item.artworkHeaders
    if (art != null && !artHeaders.isNullOrEmpty()) out[art] = artHeaders
  }
  return out
}

private fun toMediaItem(item: QueueItem): MediaItem {
  val uri = Uri.parse(item.url)
  val metadata =
    MediaMetadata.Builder()
      .setTitle(item.title)
      .setArtist(item.artist)
      .setAlbumTitle(item.album)
      .setArtworkUri(item.artwork?.let(Uri::parse))
      .setDurationMs(item.duration?.takeIf { it > 0 }?.let { (it * 1000).toLong() })
      .build()
  val extras = Bundle().apply { item.mimeType?.let { putString(EXTRA_MIME_TYPE, it) } }
  return MediaItem.Builder()
    .setMediaId(item.id)
    .setUri(uri)
    .setMimeType(item.mimeType)
    .setMediaMetadata(metadata)
    .setRequestMetadata(
      MediaItem.RequestMetadata.Builder().setMediaUri(uri).setExtras(extras).build(),
    )
    .build()
}

/** Error text for JS: Media3 code name plus message, with auth params redacted. */
private fun describe(error: PlaybackException): String {
  val message = error.message?.replace(SECRET_PARAM, "$1***")
  return if (message.isNullOrBlank()) error.errorCodeName else "${error.errorCodeName}: $message"
}
