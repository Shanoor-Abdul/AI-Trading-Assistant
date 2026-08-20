package com.aitradingassistant

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class MobileScreenCaptureModule(
    private val context: ReactApplicationContext
) : ReactContextBaseJavaModule(context) {

    companion object {
        const val REQUEST_CODE = 8401
    }

    private var pendingPromise: Promise? = null
    private var intervalSeconds = 15

    init {
        MobileScreenCaptureService.attachReactContext(context)
    }

    override fun getName(): String = "MobileScreenCapture"

    @ReactMethod
    fun start(seconds: Int, promise: Promise) {
        val activity: Activity? = context.currentActivity

        if (activity == null) {
            promise.reject(
                "NO_ACTIVITY",
                "Android activity is not available."
            )
            return
        }

        if (pendingPromise != null) {
            promise.reject(
                "BUSY",
                "Screen capture permission request is already pending."
            )
            return
        }

        intervalSeconds = seconds.coerceIn(5, 300)

        val manager =
            activity.getSystemService(Activity.MEDIA_PROJECTION_SERVICE)
                    as? MediaProjectionManager

        if (manager == null) {
            promise.reject(
                "UNAVAILABLE",
                "MediaProjection is unavailable on this device."
            )
            return
        }

        pendingPromise = promise

        activity.startActivityForResult(
            manager.createScreenCaptureIntent(),
            REQUEST_CODE
        )
    }

    @ReactMethod
    fun stop(promise: Promise) {
        MobileScreenCaptureService.stop(context)
        promise.resolve(null)
    }

    @ReactMethod
    fun isRunning(promise: Promise) {
        promise.resolve(MobileScreenCaptureService.isRunning)
    }

    fun onPermissionResult(
        resultCode: Int,
        data: Intent?
    ) {
        val promise = pendingPromise ?: return
        pendingPromise = null

        if (resultCode != Activity.RESULT_OK || data == null) {
            promise.reject(
                "PERMISSION_DENIED",
                "Screen capture permission was not granted."
            )
            return
        }

        MobileScreenCaptureService.start(
            context,
            resultCode,
            data,
            intervalSeconds
        )

        promise.resolve(true)
    }
}