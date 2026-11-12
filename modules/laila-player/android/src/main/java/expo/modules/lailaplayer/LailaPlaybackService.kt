package expo.modules.lailaplayer

import android.app.PendingIntent
import android.content.Intent
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSourceBitmapLoader
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

internal const val EXTRA_MIME_TYPE = "laila.mimeType"

/**
 * Owns the ExoPlayer and its MediaSession. Media3 promotes the service to a
 * foreground `mediaPlayback` service while playing and shows the media
 * notification; the JS side talks to it through a MediaController.
 */
@OptIn(UnstableApi::class)
class LailaPlaybackService : MediaSessionService() {
  private var session: MediaSession? = null

  override fun onCreate() {
    super.onCreate()

    val dataSourceFactory = headerInjectingFactory()
    val player =
      ExoPlayer.Builder(this)
        .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build(),
          /* handleAudioFocus= */ true,
        )
        .setHandleAudioBecomingNoisy(true)
        .setWakeMode(C.WAKE_MODE_NETWORK)
        .build()

    player.addListener(
      object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
          // Pause here, on the player thread, so the next native item does not
          // keep playing while JS decides (repeat one, up next, radio, ...).
          if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO && PlaybackBridge.pauseOnAutoAdvance) {
            player.pause()
          }
        }
      },
    )

    val builder =
      MediaSession.Builder(this, QueueForwardingPlayer(player))
        .setCallback(SessionCallback())
        .setBitmapLoader(DataSourceBitmapLoader.Builder(this).setDataSourceFactory(dataSourceFactory).build())
    sessionActivity()?.let { builder.setSessionActivity(it) }
    session = builder.build()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

  override fun onTaskRemoved(rootIntent: Intent?) {
    // Swiping Laila away from recents stops playback and the service.
    pauseAllPlayersAndStopSelf()
  }

  override fun onDestroy() {
    session?.run {
      player.release()
      release()
    }
    session = null
    super.onDestroy()
  }

  /** Streams, offline files and artwork share one factory, so headers apply to all. */
  private fun headerInjectingFactory(): DataSource.Factory {
    val http = DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(true).setUserAgent("Laila")
    val upstream = DefaultDataSource.Factory(this, http)
    return ResolvingDataSource.Factory(upstream) { spec ->
      val extra = PlaybackBridge.headersFor(spec.uri)
      if (extra.isEmpty()) spec else spec.withAdditionalHeaders(extra)
    }
  }

  private fun sessionActivity(): PendingIntent? {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    return PendingIntent.getActivity(
      this,
      0,
      launch,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  private class SessionCallback : MediaSession.Callback {
    override fun onConnect(
      session: MediaSession,
      controller: MediaSession.ControllerInfo,
    ): MediaSession.ConnectionResult {
      // Don't derive the notification result from `super.onConnect`: the
      // deprecated default returns the "not implemented" marker with EMPTY
      // commands. Media3 uses that marker to fall back to onConnectAsync,
      // which grants the full command set. The notification controller needs
      // those defaults, otherwise its timeline is empty and Media3 refuses to
      // post the notification at all.
      if (!session.isMediaNotificationController(controller)) {
        return super.onConnect(session, controller)
      }
      val defaults = MediaSession.ConnectionResult.AcceptedResultBuilder(session, controller).build()
      // Keep the notification and lock screen compact, as before: play/pause
      // plus previous/next. No seek bar, no shuffle/repeat toggles.
      val commands =
        defaults.availablePlayerCommands
          .buildUpon()
          .removeAll(
            Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
            Player.COMMAND_SEEK_BACK,
            Player.COMMAND_SEEK_FORWARD,
            Player.COMMAND_SET_SHUFFLE_MODE,
            Player.COMMAND_SET_REPEAT_MODE,
          )
          .build()
      return MediaSession.ConnectionResult.AcceptedResultBuilder(session, controller)
        .setAvailableSessionCommands(defaults.availableSessionCommands)
        .setAvailablePlayerCommands(commands)
        .build()
    }

    override fun onAddMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: MutableList<MediaItem>,
    ): ListenableFuture<MutableList<MediaItem>> =
      Futures.immediateFuture(mediaItems.map(::withPlaybackUri).toMutableList())

    override fun onSetMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: MutableList<MediaItem>,
      startIndex: Int,
      startPositionMs: Long,
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> =
      Futures.immediateFuture(
        MediaSession.MediaItemsWithStartPosition(
          mediaItems.map(::withPlaybackUri),
          startIndex,
          startPositionMs,
        ),
      )
  }
}

/**
 * MediaController strips `localConfiguration` (the URI) when items cross to the
 * session, so the URI also travels in `requestMetadata` and is restored here.
 */
private fun withPlaybackUri(item: MediaItem): MediaItem {
  if (item.localConfiguration != null) return item
  val uri = item.requestMetadata.mediaUri ?: return item
  return item
    .buildUpon()
    .setUri(uri)
    .setMimeType(item.requestMetadata.extras?.getString(EXTRA_MIME_TYPE))
    .build()
}

/**
 * Routes next/previous from the notification, lock screen and headset buttons
 * to Laila's queue (the store owns repeat, shuffle, up next and radio). Without
 * a JS listener it falls back to the native queue.
 */
private class QueueForwardingPlayer(player: Player) : ForwardingPlayer(player) {
  override fun seekToNext() {
    if (!PlaybackBridge.remoteNext()) super.seekToNext()
  }

  override fun seekToNextMediaItem() {
    if (!PlaybackBridge.remoteNext()) super.seekToNextMediaItem()
  }

  override fun seekToPrevious() {
    if (!PlaybackBridge.remotePrevious()) super.seekToPrevious()
  }

  override fun seekToPreviousMediaItem() {
    if (!PlaybackBridge.remotePrevious()) super.seekToPreviousMediaItem()
  }
}
