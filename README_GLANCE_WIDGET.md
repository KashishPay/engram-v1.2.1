# Android Jetpack Compose Glance Widget Setup

The Kotlin source files and configuration for your new Glance home screen widget have been implemented. 

In order to keep the system safe and to strictly adhere to the instruction to **NOT modify any existing Gradle or build configuration**, the newly created `.kt` files are currently resting within your source directory without breaking the app build. The Kotlin compiler in this project is presently inactive until explicitly enabled via `build.gradle`.

### Files Generated

1. `android/app/src/main/java/com/engram/app/glance/EngramWidget.kt` 
   - Handles the composition of the UI using Jetpack Compose and fetches the `CapacitorStorage` string values.
2. `android/app/src/main/java/com/engram/app/glance/EngramWidgetReceiver.kt`
   - Maps the widget updates to the Glance provider.
3. `android/app/src/main/res/xml/engram_widget_info.xml`
   - Defines the dimensions and sizing traits.
4. `android/app/src/main/res/layout/glance_default_loading.xml`
   - Placeholder fallback loaded by Android until Glance initializes.
5. **Android Manifest (`AndroidManifest.xml`)**
   - Registered `.glance.EngramWidgetReceiver`.

### Final Requirements to Activate

Because Jetpack Compose Glance requires its specific library dependencies and build features to be recognized, you will need to add these rules to your `android/app/build.gradle` when you are ready to compile the Android widget:

```gradle
android {
    ...
    buildFeatures {
        compose true
    }
    composeOptions {
        kotlinCompilerExtensionVersion '1.5.8'
    }
}

dependencies {
    ...
    implementation "androidx.glance:glance-appwidget:1.1.0"
    implementation "androidx.glance:glance-material3:1.1.0"
}
```

Make sure that your `android/build.gradle` root file and `android/app/build.gradle` both configure the `kotlin-android` plugin correctly in order for the `glance` module `.kt` files to compile perfectly alongside your native service integrations!
