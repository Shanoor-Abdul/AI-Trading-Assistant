package com.aitradingassistant

import android.content.Intent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  override fun getMainComponentName(): String = "AITradingAssistantMobile"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode == MobileScreenCaptureModule.REQUEST_CODE) {
      val module = reactInstanceManager.currentReactContext
        ?.getNativeModule(MobileScreenCaptureModule::class.java)
      module?.onPermissionResult(resultCode, data)
    }
  }
}
