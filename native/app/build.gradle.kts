plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.ghostkey.explorer"
    compileSdk = 35

    defaultConfig {
        // New native app ID: installs alongside the older Capacitor build
        // (com.ether4o4.ghostkeyfileexplorer) instead of colliding with it.
        applicationId = "com.ether4o4.ghostkey"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    // Stable signing identity so every CI build installs over the previous one.
    // Default: the self-signed keystore committed in native/signing (sideload
    // distribution, not a Play Store key). GitHub Secrets override it.
    val envKeystorePath: String? = System.getenv("GK_KEYSTORE_PATH")
    signingConfigs {
        create("release") {
            if (envKeystorePath != null) {
                storeFile = file(envKeystorePath)
                storePassword = System.getenv("GK_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("GK_KEY_ALIAS")
                keyPassword = System.getenv("GK_KEY_PASSWORD")
            } else {
                storeFile = rootProject.file("signing/ghostkey-release.keystore")
                storePassword = "ghostkey"
                keyAlias = "ghostkey"
                keyPassword = "ghostkey"
            }
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("release")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
    testOptions {
        unitTests.isReturnDefaultValues = true
        unitTests.isIncludeAndroidResources = true
        unitTests.all { test ->
            test.systemProperty("robolectric.graphicsMode", "NATIVE")
            test.systemProperty("screenshots.dir", rootProject.file("../docs/screenshots").absolutePath)
            // Screenshots only when asked: ./gradlew testDebugUnitTest -Pscreenshots
            if (!project.hasProperty("screenshots")) test.exclude("**/*ScreenshotTest*")
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.runtime)
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation(libs.coroutines.android)
    debugImplementation(libs.compose.ui.tooling)
    testImplementation("junit:junit:4.13.2")
    // Headless UI screenshots (Robolectric native graphics)
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    testImplementation("org.json:json:20240303")
}
