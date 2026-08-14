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
import android.graphics.YuvImage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream

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

  override fun onCreate() { super.onCreate(); createNotificationChannel() }

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
    display = projection?.createVirtualDisplay("AITradingAssistantScreen", width, height, metrics.densityDpi, 0, reader?.surface, null, null)
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
    val width = image.width
    val height = image.height
    val nv21 = yuv420ToNv21(image)
    val yuv = YuvImage(nv21, ImageFormat.NV21, width, height, null)
    val out = ByteArrayOutputStream()
    yuv.compressToJpeg(Rect(0, 0, width, height), 70, out)
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }

  private fun yuv420ToNv21(image: Image): ByteArray {
    val width = image.width
    val height = image.height
    val out = ByteArray(width * height * 3 / 2)
    val planes = image.planes
    var offset = 0
    val yPlane = planes[0]
    val yBuffer = yPlane.buffer
    val yRowStride = yPlane.rowStride
    val yPixelStride = yPlane.pixelStride
    for (row in 0 until height) {
      val rowStart = row * yRowStride
      for (col in 0 until width) {
        out[offset++] = yBuffer.get(rowStart + col * yPixelStride)
      }
    }

    val uPlane = planes[1]
    val vPlane = planes[2]
    val uBuffer = uPlane.buffer
    val vBuffer = vPlane.buffer
    val chromaHeight = height / 2
    val chromaWidth = width / 2
    val uRowStride = uPlane.rowStride
    val vRowStride = vPlane.rowStride
    val uPixelStride = uPlane.pixelStride
    val vPixelStride = vPlane.pixelStride
    for (row in 0 until chromaHeight) {
      for (col in 0 until chromaWidth) {
        val uIndex = row * uRowStride + col * uPixelStride
        val vIndex = row * vRowStride + col * vPixelStride
        out[offset++] = vBuffer.get(vIndex)
        out[offset++] = uBuffer.get(uIndex)
      }
    }
    return out
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
    lastFrameAt = 0L
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() { stopCapture(); super.onDestroy() }
  override fun onBind(intent: Intent?): IBinder? = null

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL_ID, "Trading screen capture", NotificationManager.IMPORTANCE_LOW))
    }
  }

  private fun notification(): Notification = Notification.Builder(this, CHANNEL_ID)
    .setContentTitle("AI Trading Assistant")
    .setContentText("Screen observation is active")
    .setSmallIcon(android.R.drawable.ic_menu_view)
    .setOngoing(true)
    .build()

  @Suppress("DEPRECATION")
  private inline fun <reified T : android.os.Parcelable> Intent.getParcelableExtraCompat(key: String): T? = if (Build.VERSION.SDK_INT >= 33) getParcelableExtra(key, T::class.java) else getParcelableExtra(key)
}
