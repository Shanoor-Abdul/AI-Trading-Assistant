package com.aitradingassistant

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.ImageFormat
import android.graphics.Rect
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Base64
import android.util.DisplayMetrics
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import android.graphics.Bitmap

class MobileScreenCaptureService : Service() {
  companion object {
    const val ACTION_START = "com.aitradingassistant.START_CAPTURE"
    const val ACTION_STOP = "com.aitradingassistant.STOP_CAPTURE"
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_DATA = "data"
    const val EXTRA_INTERVAL = "interval"
    private const val CHANNEL_ID = "trading_screen_capture"
    private const val NOTIFICATION_ID = 8402
    @Volatile var isRunning = false
    private var reactContext: ReactApplicationContext? = null

    fun start(context: Context, resultCode: Int, data: Intent, interval: Int) {
      val intent = Intent(context, MobileScreenCaptureService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_RESULT_CODE, resultCode)
        putExtra(EXTRA_DATA, data)
        putExtra(EXTRA_INTERVAL, interval)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, MobileScreenCaptureService::class.java).setAction(ACTION_STOP))
    }

    fun attachReactContext(context: ReactApplicationContext) { reactContext = context }

    private fun emitFrame(timestamp: Long, base64: String) {
      val map = Arguments.createMap().apply {
        putDouble("timestamp", timestamp.toDouble())
        putString("base64", base64)
        putString("mimeType", "image/jpeg")
      }
      reactContext?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit("MobileScreenFrame", map)
    }
  }

  private var projection: MediaProjection? = null
  private var reader: ImageReader? = null
  private var display: android.hardware.display.VirtualDisplay? = null
  private var worker: HandlerThread? = null
  private var handler: Handler? = null
  private var intervalMs = 15_000L
  private var lastFrameAt = 0L

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> stopCapture()
      ACTION_START -> {
        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, -1)
        val data = intent.getParcelableExtraCompat<Intent>(EXTRA_DATA) ?: return START_NOT_STICKY
        intervalMs = intent.getIntExtra(EXTRA_INTERVAL, 15).coerceIn(5, 300) * 1000L
        startForeground(NOTIFICATION_ID, notification())
        startCapture(resultCode, data)
      }
    }
    return START_STICKY
  }

  private fun startCapture(resultCode: Int, data: Intent) {
    if (isRunning) return
    val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    projection = manager.getMediaProjection(resultCode, data)

    val metrics = DisplayMetrics()
    @Suppress("DEPRECATION")
    (getSystemService(WINDOW_SERVICE) as WindowManager).defaultDisplay.getRealMetrics(metrics)
    val width = minOf(metrics.widthPixels, 1280)
    val height = (metrics.heightPixels.toFloat() * width / metrics.widthPixels).toInt().coerceAtLeast(1)

    reader = ImageReader.newInstance(width, height, ImageFormat.YUV_420_888, 2)
    display = projection?.createVirtualDisplay(
      "AITradingAssistantScreen",
      width,
      height,
      metrics.densityDpi,
      0,
      reader?.surface,
      null,
      null,
    )

    worker = HandlerThread("ScreenCaptureWorker").also { it.start() }
    handler = Handler(worker!!.looper)
    isRunning = true
    scheduleFrame()
  }

  private fun scheduleFrame() {
    handler?.postDelayed({
      captureLatestFrame()
      if (isRunning) scheduleFrame()
    }, if (lastFrameAt == 0L) 250L else intervalMs)
  }

  private fun captureLatestFrame() {
    val image = reader?.acquireLatestImage() ?: return
    image.use { emitFrame(System.currentTimeMillis(), imageToJpegBase64(image)) }
    lastFrameAt = System.currentTimeMillis()
  }

  private fun imageToJpegBase64(image: Image): String {
    val planes = image.planes
    val width = image.width
    val height = image.height
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val buffer = planes[0].buffer
    val rowStride = planes[0].rowStride
    val pixelStride = planes[0].pixelStride
    val rowPadding = rowStride - pixelStride * width
    val paddedWidth = width + rowPadding / pixelStride
    val bytes = ByteArray(buffer.remaining()).also { buffer.get(it) }
    val tmp = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888)
    tmp.copyPixelsFromBuffer(ByteBuffer.wrap(bytes))
    val canvas = android.graphics.Canvas(bitmap)
    canvas.drawBitmap(tmp, 0f, 0f, null)
    tmp.recycle()
    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, 70, out)
    bitmap.recycle()
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }

  private fun stopCapture() {
    isRunning = false
    handler?.removeCallbacksAndMessages(null)
    worker?.quitSafely()
    display?.release()
    reader?.close()
    projection?.stop()
    display = null
    reader = null
    projection = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() { stopCapture(); super.onDestroy() }
  override fun onBind(intent: Intent?): IBinder? = null

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Trading screen capture", NotificationManager.IMPORTANCE_LOW)
      )
    }
  }

  private fun notification(): Notification = Notification.Builder(this, CHANNEL_ID)
    .setContentTitle("AI Trading Assistant")
    .setContentText("Screen observation is active")
    .setSmallIcon(android.R.drawable.ic_menu_view)
    .setOngoing(true)
    .build()

  @Suppress("DEPRECATION")
  private inline fun <reified T : android.os.Parcelable> Intent.getParcelableExtraCompat(key: String): T? =
    if (Build.VERSION.SDK_INT >= 33) getParcelableExtra(key, T::class.java) else getParcelableExtra(key)
}
