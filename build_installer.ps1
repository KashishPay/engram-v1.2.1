# ==============================================================================
# ENGRAM ANDROID BUILD AUTOMATOR (Iterated v1.8)
# ==============================================================================

# 1) Define Paths & Auto-Detect Latest Zip
$downloads = "$env:USERPROFILE\Downloads"
$latestZip = Get-ChildItem -Path $downloads -Filter "engram-*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (!$latestZip) {
    Write-Error "CRITICAL: No 'engram-*.zip' found in $downloads."
    exit
}

$zip  = $latestZip.FullName
$src  = "$env:USERPROFILE\Desktop\$($latestZip.BaseName)_extracted"
$repo = "$env:USERPROFILE\Desktop\engram_audit"

Write-Output "Detected latest ZIP: $zip"

# 2) Clean & Extract
Write-Output "--- Step 1: Cleaning workspace ---"
# Stop any lingering Java processes that might lock Gradle files
Get-Process -Name "java" -ErrorAction SilentlyContinue | Stop-Process -Force
if (Test-Path $src) { Remove-Item $src -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path $repo) { Remove-Item $repo -Recurse -Force -ErrorAction SilentlyContinue }

Write-Output "--- Step 2: Extracting ZIP ---"
Expand-Archive -Path $zip -DestinationPath $src -Force

# CRITICAL: Unblock files to fix "unsupported image format" or "permission denied" errors on Windows
Write-Output "Unblocking files for Windows security..."
Get-ChildItem -Path $src -Recurse | Unblock-File

# 3) Copy code to repo
Write-Output "--- Step 3: Copying files ---"
New-Item -ItemType Directory -Force -Path $repo | Out-Null

# Detect the inner folder (GitHub ZIPs usually have a 'repo-main' subfolder)
$inner = Get-ChildItem -Path $src -Directory | Where-Object { $_.Name -like "engram*" } | Select-Object -First 1
$from  = if ($inner) { $inner.FullName } else { $src }

# Use Robocopy for speed and reliability. /MT:32 uses multi-threading.
# Piped to Out-Null to keep the console clean.
& robocopy $from $repo /E /MT:32 /XD node_modules dist .git ios /XF .env.local | Out-Null
cd $repo

# 4) Configure Package & PDF Worker
Write-Output "--- Step 4: Configuring project scripts ---"
npm pkg set type="module"
npm pkg set scripts.dev="vite"
npm pkg set scripts.build="vite build"
npm pkg set scripts.preview="vite preview"
npm pkg set scripts.lint="eslint . --ext .ts,.tsx"
npm pkg set scripts.resources="capacitor-assets generate"
npm pkg set scripts.check:no-alias="grep -r \"@/\" . && exit 1 || echo 'Pass: No aliases found.'"

# Create PDF worker helper script
New-Item -ItemType Directory -Force -Path .\scripts | Out-Null
$workerScript = @'
const fs = require("fs");
const path = require("path");
const destDir = path.join("public");
if (!fs.existsSync(destDir)){ fs.mkdirSync(destDir, { recursive: true }); }
const src = path.join("node_modules","pdfjs-dist","build","pdf.worker.min.js");
const dst = path.join("public","pdf.worker.min.js");
if (fs.existsSync(src)) { 
    fs.copyFileSync(src, dst);
    console.log("PDF Worker copied to public/");
} else {
    console.warn("Warning: pdf.worker.min.js not found in node_modules.");
}
'@ 
$workerScript | Set-Content -Encoding UTF8 .\scripts\copy-pdf-worker.cjs
npm pkg set "scripts.postinstall=node scripts/copy-pdf-worker.cjs"

# 5) Clean Install Dependencies
Write-Output "--- Step 5: Installing Dependencies ---"
# Ensure we start fresh
if (Test-Path "node_modules") { Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue }

Write-Output "Running base npm install from package.json..."
# NOTE: Using package.json strictly preserves precise, tested, production versions (e.g., React 18.2.0, PDF.js, matching Lucide icons)
# and prevents accidental breaking upgrades to React 19 which is incompatible with several assets/libraries.
npm install

Write-Output "Ensuring Core UX Capacitor Plugins are installed..."
# Install standard UI plugins (Splash Screen, Status Bar, Keyboard) which are essential for native polish
# but often omitted from package.json. This ensures assets generated in Step 8 render correctly.
npm install @capacitor/splash-screen @capacitor/status-bar @capacitor/keyboard @capacitor/preferences @capacitor/app @capacitor/filesystem @capacitor/haptics @capacitor/local-notifications @capacitor/share --save

# 6) Build Web App
Write-Output "--- Step 6: Building Web Assets ---"
# Manually run worker copy in case postinstall didn't trigger yet
node scripts/copy-pdf-worker.cjs
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Error "CRITICAL: Vite build failed. Halting before Android sync."
    exit
}

# 7) Initialize Android
Write-Output "--- Step 7: Initializing Android ---"
if (!(Test-Path "android")) {
    npx cap add android
}

# 8) Generate App Icons & Splash
Write-Output "--- Step 8: Generating App Assets ---"
New-Item -ItemType Directory -Force -Path "assets" | Out-Null

# Priority: 1024px -> 512px -> any logo
$LogoSource = "public\brand\engram_logo\engram_logo_1024.png"
if (!(Test-Path $LogoSource)) { $LogoSource = "public\brand\engram_logo\engram_logo_512.png" }
if (!(Test-Path $LogoSource)) { 
    $found = Get-ChildItem "public\brand\*" -Include *.png -Recurse | Select-Object -First 1
    if ($found) { $LogoSource = $found.FullName }
}

if (Test-Path $LogoSource) {
    Write-Output "Using logo source: $LogoSource"
    Copy-Item $LogoSource "assets\icon-only.png" -Force
    Copy-Item $LogoSource "assets\icon-foreground.png" -Force
    Copy-Item $LogoSource "assets\icon-background.png" -Force
    Copy-Item $LogoSource "assets\splash.png" -Force
    Copy-Item $LogoSource "assets\splash-dark.png" -Force
    
    # Generate assets
    npx @capacitor/assets generate --android
} else {
    Write-Warning "No logo found in public/brand/. Skipping icon generation."
}

# 9) Windows-Specific Build Fixes
Write-Output "--- Step 9: Applying Windows Build Fixes ---"
if (Test-Path "android") {
    # 1. Fix "VANILLA_ICE_CREAM" and AdMob errors by bumping SDK versions to stable Android 15
    $varsFile = "android\variables.gradle"
    if (Test-Path $varsFile) {
        $varsContent = Get-Content $varsFile -Raw
        $varsContent = $varsContent -replace 'compileSdkVersion = \d+', 'compileSdkVersion = 36'
        $varsContent = $varsContent -replace 'targetSdkVersion = \d+', 'targetSdkVersion = 36'
        $varsContent = $varsContent -replace 'minSdkVersion = \d+', 'minSdkVersion = 24'
        $varsContent = $varsContent -replace "androidxCoreVersion = '[^']+'", "androidxCoreVersion = '1.15.0'"
        if ($varsContent -notmatch "kotlin_version") {
            $varsContent = "ext.kotlin_version = '2.0.21'`n" + $varsContent
        } else {
            $varsContent = $varsContent -replace "kotlin_version\s*=\s*'[^']+'", "kotlin_version = '2.0.21'"
        }
        Set-Content -Path $varsFile -Value $varsContent
        Write-Output "Updated variables.gradle (compile/target=36, min=24, androidxCoreVersion=1.15.0, kotlin_version=2.0.21)."
    }

    # 1.1 Update gradle-wrapper.properties
    $gradleWrapperFile = "android\gradle\wrapper\gradle-wrapper.properties"
    if (Test-Path $gradleWrapperFile) {
        $wrapperContent = Get-Content $gradleWrapperFile -Raw
        $wrapperContent = $wrapperContent -replace 'distributionUrl=.*', 'distributionUrl=https\://services.gradle.org/distributions/gradle-8.11.1-bin.zip'
        Set-Content -Path $gradleWrapperFile -Value $wrapperContent
        Write-Output "Updated gradle-wrapper.properties to use gradle-8.11.1"
    }

    # 1.2 Update AGP version in root build.gradle
    $rootGradleFile = "android\build.gradle"
    if (Test-Path $rootGradleFile) {
        $rootGradleContent = Get-Content $rootGradleFile -Raw
        # Also handle standard AGP classpaths as well as variables if any
        $rootGradleContent = $rootGradleContent -replace "classpath 'com\.android\.tools\.build:gradle:[^']+'", "classpath 'com.android.tools.build:gradle:8.9.1'"
        $rootGradleContent = $rootGradleContent -replace "classpath 'org\.jetbrains\.kotlin:kotlin-gradle-plugin:[^']+'", "classpath `"org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21`""
        if ($rootGradleContent -notmatch "compose-compiler-gradle-plugin") {
            $rootGradleContent = $rootGradleContent -replace "classpath `"org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21`"", "classpath `"org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21`"`n        classpath `"org.jetbrains.kotlin:compose-compiler-gradle-plugin:2.0.21`""
        }
        
        # Inject kotlin_version into buildscript block if not already present
        if ($rootGradleContent -notmatch "ext\.kotlin_version") {
            $rootGradleContent = $rootGradleContent -replace "buildscript\s*\{(?!\s*ext\.kotlin_version)", "buildscript {`n    ext.kotlin_version = '2.0.21'"
        }
        
        # 1.3 Add subprojects block for Java/Kotlin 17 enforcement
        if ($rootGradleContent -notmatch "subprojects\s*\{") {
            $subprojectsBlock = @"

subprojects {
    afterEvaluate { project ->

        // Fix Java for all modules
        if (project.hasProperty("android")) {
            project.android {
                compileOptions {
                    sourceCompatibility JavaVersion.VERSION_17
                    targetCompatibility JavaVersion.VERSION_17
                }
            }
        }

        // Fix Kotlin for all modules (SAFE method)
        project.tasks.matching { it.name.contains("Kotlin") }.configureEach {
            if (it.hasProperty("kotlinOptions")) {
                it.kotlinOptions.jvmTarget = "17"
            }
        }
    }
}
"@
            $rootGradleContent = $rootGradleContent + $subprojectsBlock
        }
        
        Set-Content -Path $rootGradleFile -Value $rootGradleContent
        Write-Output "Updated Android Gradle Plugin (AGP) version to 8.9.1 and injected Java 17 / Kotlin 17 constraints in build.gradle."
    }

    # 2. Disable VFS watch to prevent file locking issues on Windows
    # 3. Increase Heap size for Gradle
    $gradleProps = "android\gradle.properties"
    $fixes = "`norg.gradle.vfs.watch=false`norg.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8"
    
    if (Test-Path $gradleProps) {
        $content = Get-Content $gradleProps -Raw
        if ($content -notmatch "org.gradle.vfs.watch=false") {
            Add-Content -Path $gradleProps -Value $fixes
        }
    } else {
        Set-Content -Path $gradleProps -Value $fixes
    }

    # 4. Inject AdMob App ID and File Opener Queries into AndroidManifest.xml
    $manifestFile = "android\app\src\main\AndroidManifest.xml"
    if (Test-Path $manifestFile) {
        $manifestContent = Get-Content $manifestFile -Raw
        
        # Inject AdMob App ID if missing
        if ($manifestContent -notmatch "com.google.android.gms.ads.APPLICATION_ID") {
            # Using your real App ID: ca-app-pub-1930133918087114~6997595405
            $admobMeta = "`n        <meta-data android:name=`"com.google.android.gms.ads.APPLICATION_ID`" android:value=`"ca-app-pub-1930133918087114~6997595405`"/>"
            # Optimization flags
            $admobMeta += "`n        <meta-data android:name=`"com.google.android.gms.ads.flag.OPTIMIZE_INITIALIZATION`" android:value=`"true`"/>"
            $admobMeta += "`n        <meta-data android:name=`"com.google.android.gms.ads.flag.OPTIMIZE_AD_LOADING`" android:value=`"true`"/>"
            
            $manifestContent = $manifestContent -replace '<application([^>]*)>', "<application`$1>$admobMeta"
            Write-Output "Injected AdMob App ID and Optimization flags into AndroidManifest.xml."
        }

        # Inject Permissions for Plugins (Local Notifications, Filesystem, Keep Awake, Haptics)
        $permsToInject = @(
            "android.permission.SCHEDULE_EXACT_ALARM",
            "android.permission.USE_EXACT_ALARM",
            "android.permission.POST_NOTIFICATIONS",
            "android.permission.RECEIVE_BOOT_COMPLETED",
            "android.permission.WRITE_EXTERNAL_STORAGE",
            "android.permission.READ_EXTERNAL_STORAGE",
            "android.permission.WAKE_LOCK",
            "android.permission.VIBRATE",
            "com.google.android.gms.permission.AD_ID",
            "android.permission.SYSTEM_ALERT_WINDOW",
            "android.permission.FOREGROUND_SERVICE",
            "android.permission.FOREGROUND_SERVICE_SPECIAL_USE"
        )

        foreach ($perm in $permsToInject) {
            if ($manifestContent -notmatch $perm) {
                $manifestContent = $manifestContent -replace '<manifest([^>]*)>', "<manifest`$1>`n    <uses-permission android:name=`"$perm`" />"
                Write-Output "Injected permission: $perm"
            }
        }
        
        # Verify Widget Receiver registrations
        $widgetsToInject = @(
            @{Name="EngramWidgetReceiver"; Xml="engram_widget_info"; Label="Engram Widget"},
            @{Name="FocusWidgetReceiver"; Xml="focus_widget_info"; Label="Focus Timer Widget"},
            @{Name="ReviewWidgetReceiver"; Xml="review_widget_info"; Label="Due Reviews Widget"},
            @{Name="StreakWidgetReceiver"; Xml="streak_widget_info"; Label="Activity Streak Widget"}
        )

        foreach ($w in $widgetsToInject) {
            $name = $w.Name
            $xml = $w.Xml
            $label = $w.Label
            if ($manifestContent -notmatch $name) {
                $meta = "`n        <receiver android:name=`".glance.$name`" android:label=`"$label`" android:exported=`"true`">`n            <intent-filter>`n                <action android:name=`"android.appwidget.action.APPWIDGET_UPDATE`" />`n            </intent-filter>`n            <meta-data android:name=`"android.appwidget.provider`" android:resource=`"@xml/$xml`" />`n        </receiver>"
                $manifestContent = $manifestContent -replace '</application>', "$meta`n    </application>"
                Write-Output "Injected $name into AndroidManifest.xml."
            }
        }

        # Verify OverlayTimerService registration
        if ($manifestContent -notmatch "OverlayTimerService") {
            $serviceMeta = "`n        <service android:name=`".OverlayTimerService`" android:enabled=`"true`" android:exported=`"false`" android:foregroundServiceType=`"specialUse`" />"
            $manifestContent = $manifestContent -replace '</application>', "$serviceMeta`n    </application>"
            Write-Output "Injected OverlayTimerService into AndroidManifest.xml."
        }

        # Inject <queries> for File Opener (Android 11+)
        if ($manifestContent -notmatch "<queries>") {
            $queriesMeta = "`n    <queries>`n        <intent>`n            <action android:name=`"android.intent.action.VIEW`" />`n            <category android:name=`"android.intent.category.DEFAULT`" />`n            <data android:mimeType=`"*/*`" />`n        </intent>`n    </queries>"
            $manifestContent = $manifestContent -replace '<manifest([^>]*)>', "<manifest`$1>$queriesMeta"
            Write-Output "Injected <queries> tag for File Opener plugin."
        } elseif ($manifestContent -notmatch "android.intent.action.VIEW") {
            # If queries tag exists but missing our intent
            $intentMeta = "`n        <intent>`n            <action android:name=`"android.intent.action.VIEW`" />`n            <category android:name=`"android.intent.category.DEFAULT`" />`n            <data android:mimeType=`"*/*`" />`n        </intent>"
            $manifestContent = $manifestContent -replace '</queries>', "$intentMeta`n    </queries>"
            Write-Output "Appended VIEW intent to <queries> tag."
        }

        Set-Content -Path $manifestFile -Value $manifestContent
    }

    # 5. Auto-increment versionCode in app/build.gradle to allow app updates over previous installs
    # and enforce Java 17 compatibility rules
    $appGradleFile = "android\app\build.gradle"
    if (Test-Path $appGradleFile) {
        $appGradleContent = Get-Content $appGradleFile -Raw
        
        # Increment versionCode
        if ($appGradleContent -match 'versionCode\s+(\d+)') {
            $currentVersionCode = [int]$matches[1]
            $newVersionCode = $currentVersionCode + 1
            $appGradleContent = $appGradleContent -replace "versionCode\s+$currentVersionCode", "versionCode $newVersionCode"
            Write-Output "Auto-incremented versionCode to $newVersionCode in app/build.gradle to fix package update errors."
        }

        # Enforce Java 17 compatibility in app/build.gradle compileOptions
        if ($appGradleContent -match 'compileOptions\s*\{') {
            # Replace existing compileOptions compatibility lines
            $appGradleContent = $appGradleContent -replace "sourceCompatibility\s+JavaVersion\.[A-Za-z0-9_]+", "sourceCompatibility JavaVersion.VERSION_17"
            $appGradleContent = $appGradleContent -replace "targetCompatibility\s+JavaVersion\.[A-Za-z0-9_]+", "targetCompatibility JavaVersion.VERSION_17"
            Write-Output "Enforced Java 17 source/target compatibility in app/build.gradle."
        }

        # Verify Glance and Compose dependencies
        if ($appGradleContent -notmatch "androidx.glance:glance-appwidget") {
            $glanceDeps = "`n    implementation `"androidx.glance:glance-appwidget:1.1.0`"`n    implementation `"androidx.glance:glance-material3:1.1.0`""
            $appGradleContent = $appGradleContent -replace 'dependencies\s*\{', "dependencies {$glanceDeps"
            Write-Output "Injected Glance dependencies into app/build.gradle."
        }
        if ($appGradleContent -notmatch "buildFeatures\s*\{[^}]*compose\s+true") {
            if ($appGradleContent -match "buildFeatures\s*\{") {
                $appGradleContent = $appGradleContent -replace "buildFeatures\s*\{", "buildFeatures {`n        compose true"
            } else {
                $appGradleContent = $appGradleContent -replace 'android\s*\{', "android {`n    buildFeatures {`n        compose true`n    }"
            }
            Write-Output "Enabled Compose buildFeatures in app/build.gradle."
        }

        # Remove deprecated composeOptions for Kotlin 2.0+
        if ($appGradleContent -match 'composeOptions\s*\{(?:\s*kotlinCompilerExtensionVersion\s*[^}]*\s*)?\}') {
            $appGradleContent = [regex]::Replace($appGradleContent, '(?s)composeOptions\s*\{(?:[^{}]*|\{[^{}]*\})*\}', '')
            Write-Output "Removed deprecated composeOptions from app/build.gradle for Kotlin 2.0+ compatibility."
        }
        
        # Apply JetBrains Compose Compiler plugin
        if ($appGradleContent -notmatch "org\.jetbrains\.kotlin\.plugin\.compose") {
            $appGradleContent = $appGradleContent -replace "apply plugin:\s*'org\.jetbrains\.kotlin\.android'", "apply plugin: 'org.jetbrains.kotlin.android'`napply plugin: 'org.jetbrains.kotlin.plugin.compose'"
            Write-Output "Applied org.jetbrains.kotlin.plugin.compose plugin in app/build.gradle."
        }

        Set-Content -Path $appGradleFile -Value $appGradleContent
    }

    # 6. Ensure widget XML exists and is correct
    $widgetNames = @("engram_widget_info", "focus_widget_info", "review_widget_info", "streak_widget_info")
    
    foreach ($widget in $widgetNames) {
        $widgetXmlFile = "android\app\src\main\res\xml\$widget.xml"
        $xmlDir = Split-Path $widgetXmlFile -Parent
        if (-not (Test-Path $xmlDir)) {
            New-Item -ItemType Directory -Force -Path $xmlDir | Out-Null
        }
        
        $expectedWidgetXml = @"
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="110dp"
    android:minHeight="110dp"
    android:updatePeriodMillis="0"
    android:initialLayout="@android:layout/simple_list_item_1"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen" />
"@
        Set-Content -Path $widgetXmlFile -Value $expectedWidgetXml -Encoding UTF8
        Write-Output "Ensured $widget.xml exists with safe layout."
    }

    # 7. Enforce safe fallback layouts in other widget XMLs
    $xmlResDir = "android\app\src\main\res\xml"
    if (Test-Path $xmlResDir) {
        Get-ChildItem -Path $xmlResDir -Filter "*.xml" | ForEach-Object {
            $xmlContent = Get-Content $_.FullName -Raw
            $layoutMatches = [regex]::Matches($xmlContent, 'android:initialLayout="(@layout/([^"]+))"')
            $modified = $false
            foreach ($match in $layoutMatches) {
                $layoutRef = $match.Groups[1].Value
                $layoutName = $match.Groups[2].Value
                $layoutFile = "android\app\src\main\res\layout\$layoutName.xml"
                if (-not (Test-Path $layoutFile)) {
                    Write-Output "Warning: Invalid layout $layoutRef in $($_.Name). Replaced with @android:layout/simple_list_item_1"
                    $xmlContent = $xmlContent.Replace($layoutRef, '@android:layout/simple_list_item_1')
                    $modified = $true
                }
            }
            if ($modified) {
                Set-Content -Path $_.FullName -Value $xmlContent
            }
        }
    }
}

# 10) Sync & Launch
Write-Output "--- Step 10: Syncing to Android ---"
npx cap sync android


