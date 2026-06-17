# ==============================================================================
# ENGRAM ANDROID BUILD AUTOMATOR (Compact Validated Version)
# ==============================================================================

# --- Helpers ---
function Update-File($Path, $Regex, $Replacement) {
    if (Test-Path $Path) {
        $content = Get-Content $Path -Raw
        if ($content -match $Regex) {
            $content -replace $Regex, $Replacement | Set-Content $Path -NoNewline
        }
    }
}

# --- 1. Workspace Setup ---
$downloads = "$env:USERPROFILE\Downloads"
$latestZip = Get-ChildItem -Path $downloads -Filter "engram-*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (!$latestZip) { throw "No 'engram-*.zip' found." }
$src  = "$env:USERPROFILE\Desktop\$($latestZip.BaseName)_ext"
$repo = "$env:USERPROFILE\Desktop\engram_audit"

Write-Host "--- Extracting & Copying ---" -ForegroundColor Cyan
Get-Process "java" -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item $src, $repo -Recurse -Force -ErrorAction SilentlyContinue 
Expand-Archive $latestZip.FullName $src -Force
Get-ChildItem $src -Recurse | Unblock-File

New-Item -ItemType Directory -Force -Path $repo | Out-Null
$inner = Get-ChildItem -Path $src -Directory | Where-Object { $_.Name -like "engram*" } | Select-Object -First 1
$from  = if ($inner) { $inner.FullName } else { $src }
& robocopy $from $repo /E /MT:32 /XD node_modules dist .git ios /XF .env.local | Out-Null
cd $repo

# --- 2. NPM Setup & Build ---
Write-Host "--- Configuring NPM & Building ---" -ForegroundColor Cyan
"type=module", "scripts.dev=vite", "scripts.build=vite build", "scripts.preview=vite preview" | ForEach-Object { npm pkg set $_ }
New-Item -ItemType Directory -Force -Path .\scripts | Out-Null
@'
const fs = require("fs");
const path = require("path");
const dst = path.join("public","pdf.worker.min.js");
if (!fs.existsSync("public")) fs.mkdirSync("public");
try { fs.copyFileSync(path.join("node_modules","pdfjs-dist","build","pdf.worker.min.js"), dst); } catch(e){}
'@ | Set-Content -Encoding UTF8 .\scripts\copy-pdf-worker.cjs
npm pkg set "scripts.postinstall=node scripts/copy-pdf-worker.cjs"

Remove-Item node_modules -Recurse -Force -ErrorAction SilentlyContinue
npm install
npm install @capacitor/splash-screen @capacitor/status-bar @capacitor/keyboard @capacitor/preferences @capacitor/app @capacitor/filesystem @capacitor/haptics @capacitor/local-notifications @capacitor/share --save
node scripts/copy-pdf-worker.cjs
npm run build
if ($LASTEXITCODE -ne 0) { throw "Vite build failed." }

# --- 3. Android Init & Assets ---
Write-Host "--- Android Init & Assets ---" -ForegroundColor Cyan
if (!(Test-Path "android")) {
    npx cap add android
}
New-Item -ItemType Directory -Force -Path "assets" | Out-Null
$logo = @("public\brand\engram_logo\engram_logo_1024.png", "public\brand\engram_logo\engram_logo_512.png") + (Get-ChildItem "public\brand\*.png" -Recurse) | Select-Object -First 1
if ($logo -and (Test-Path $logo)) {
    "icon-only.png","icon-foreground.png","icon-background.png","splash.png","splash-dark.png" | ForEach-Object { Copy-Item $logo "assets\$_" -Force }
    npx @capacitor/assets generate --android
}

# --- 4. Android Native Adjustments ---
Write-Host "--- Applying Gradle Fixes ---" -ForegroundColor Cyan
$vars = "android\variables.gradle"
Update-File $vars 'compileSdkVersion = \d+' 'compileSdkVersion = 36'
Update-File $vars 'targetSdkVersion = \d+' 'targetSdkVersion = 36'
Update-File $vars 'minSdkVersion = \d+' 'minSdkVersion = 24'
Update-File $vars "androidxCoreVersion = '[^']+'" "androidxCoreVersion = '1.15.0'"
Update-File $vars "kotlin_version\s*=\s*'[^']+'" "kotlin_version = '2.0.21'"
if ((Get-Content $vars -Raw) -notmatch "kotlin_version") { Add-Content $vars "`next.kotlin_version = '2.0.21'" }

Update-File "android\gradle\wrapper\gradle-wrapper.properties" 'distributionUrl=.*' 'distributionUrl=https\://services.gradle.org/distributions/gradle-8.11.1-bin.zip'

$root = "android\build.gradle"
Update-File $root "classpath 'com\.android\.tools\.build:gradle:[^']+'" "classpath 'com.android.tools.build:gradle:8.9.1'"
Update-File $root "classpath 'org\.jetbrains\.kotlin:kotlin-gradle-plugin:[^']+'" "classpath `"org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21`""
if ((Get-Content $root -Raw) -notmatch "compose-compiler-gradle-plugin") {
    Update-File $root "classpath `"org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21`"" "classpath `"org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21`"`n        classpath `"org.jetbrains.kotlin:compose-compiler-gradle-plugin:2.0.21`""
}
if ((Get-Content $root -Raw) -notmatch "ext\.kotlin_version") {
    Update-File $root "buildscript\s*\{" "buildscript {`n    ext.kotlin_version = '2.0.21'"
}

# Append subprojects Java 17 block to root build.gradle
if ((Get-Content $root -Raw) -notmatch "sourceCompatibility JavaVersion.VERSION_17") {
    $rootContent = Get-Content $root -Raw
    $rootContent = [regex]::Replace($rootContent, '(?s)subprojects\s*\{.*$', '')
    Add-Content $root @"

subprojects { configurations.all { resolutionStrategy { force "org.jetbrains.kotlin:kotlin-stdlib:2.0.21"; force "org.jetbrains.kotlin:kotlin-stdlib-jdk7:2.0.21"; force "org.jetbrains.kotlin:kotlin-stdlib-jdk8:2.0.21"; force "org.jetbrains.kotlin:kotlin-reflect:2.0.21" } }; afterEvaluate { project -> if (project.hasProperty("android")) { project.android { compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 } } }; project.tasks.matching { it.name.contains("Kotlin") }.configureEach { if (it.hasProperty("kotlinOptions")) { it.kotlinOptions.jvmTarget = "17"; it.kotlinOptions.freeCompilerArgs += ["-Xskip-metadata-version-check"] } } } }
"@
}

$gProps = "android\gradle.properties"
if (Test-Path $gProps) {
    $c = Get-Content $gProps -Raw
    if ($c -notmatch "org.gradle.vfs.watch=false") { Add-Content $gProps "`norg.gradle.vfs.watch=false`norg.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8" }
} else { Set-Content $gProps "org.gradle.vfs.watch=false`norg.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8" }

# --- 5. App Manifest & Config Injection ---
Write-Host "--- Android App Specific Updates ---" -ForegroundColor Cyan
$manifest = "android\app\src\main\AndroidManifest.xml"
if (Test-Path $manifest) {
    $mContent = Get-Content $manifest -Raw
    
    # AdMob & Permissions
    if ($mContent -notmatch "com.google.android.gms.ads.APPLICATION_ID") {
        $mContent = $mContent -replace '<application([^>]*)>', '<application$1>`n        <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="ca-app-pub-1930133918087114~6997595405"/>`n        <meta-data android:name="com.google.android.gms.ads.flag.OPTIMIZE_INITIALIZATION" android:value="true"/>'
    }
    $perms = "SCHEDULE_EXACT_ALARM","USE_EXACT_ALARM","POST_NOTIFICATIONS","RECEIVE_BOOT_COMPLETED","WRITE_EXTERNAL_STORAGE","READ_EXTERNAL_STORAGE","WAKE_LOCK","VIBRATE","SYSTEM_ALERT_WINDOW","FOREGROUND_SERVICE","FOREGROUND_SERVICE_SPECIAL_USE"
    foreach ($p in $perms) { if ($mContent -notmatch "android.permission.$p") { $mContent = $mContent -replace '<manifest([^>]*)>', "<manifest`$1>`n    <uses-permission android:name=`"android.permission.$p`" />" } }
    if ($mContent -notmatch "com.google.android.gms.permission.AD_ID") { $mContent = $mContent -replace '<manifest([^>]*)>', "<manifest`$1>`n    <uses-permission android:name=`"com.google.android.gms.permission.AD_ID`" />" }
    
    # Services & Receivers
    $receivers = @(
        @{Name="EngramWidgetReceiver"; Xml="engram_widget_info"},
        @{Name="FocusWidgetReceiver"; Xml="focus_widget_info"},
        @{Name="ReviewWidgetReceiver"; Xml="review_widget_info"},
        @{Name="StreakWidgetReceiver"; Xml="streak_widget_info"}
    )
    foreach ($w in $receivers) {
        $n = $w.Name
        $x = $w.Xml
        if ($mContent -notmatch $n) { $mContent = $mContent -replace '</application>', "`n        <receiver android:name=`".glance.$n`" android:exported=`"true`"><intent-filter><action android:name=`"android.appwidget.action.APPWIDGET_UPDATE`" /></intent-filter><meta-data android:name=`"android.appwidget.provider`" android:resource=`"@xml/$x`" /></receiver>`n    </application>" }
    }
    if ($mContent -notmatch "OverlayTimerService") { $mContent = $mContent -replace '</application>', "`n        <service android:name=`".OverlayTimerService`" android:enabled=`"true`" android:exported=`"false`" android:foregroundServiceType=`"specialUse`"><property android:name=`"android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE`" android:value=`"floating_timer`" /></service>`n    </application>" }
    
    if ($mContent -notmatch "<queries>") { $mContent = $mContent -replace '<manifest([^>]*)>', "<manifest`$1>`n    <queries><intent><action android:name=`"android.intent.action.VIEW`" /><category android:name=`"android.intent.category.DEFAULT`" /><data android:mimeType=`"*/*`" /></intent></queries>" }
    Set-Content $manifest $mContent -NoNewline
}

$app = "android\app\build.gradle"
if (Test-Path $app) {
    $appCnt = Get-Content $app -Raw
    if ($appCnt -match 'versionCode\s+(\d+)') {
        $appCnt = $appCnt -replace "versionCode\s+$($matches[1])", "versionCode $([int]$matches[1] + 1)"
    }
    $appCnt = $appCnt -replace "sourceCompatibility JavaVersion\.[A-Za-z0-9_]+", "sourceCompatibility JavaVersion.VERSION_17"
    $appCnt = $appCnt -replace "targetCompatibility JavaVersion\.[A-Za-z0-9_]+", "targetCompatibility JavaVersion.VERSION_17"
    if ($appCnt -notmatch "org\.jetbrains\.kotlin\.plugin\.compose") {
        $appCnt = $appCnt -replace "apply plugin:\s*'org\.jetbrains\.kotlin\.android'", "apply plugin: 'org.jetbrains.kotlin.android'`napply plugin: 'org.jetbrains.kotlin.plugin.compose'"
    }
    
    if ($appCnt -notmatch "androidx.glance:glance-appwidget") { $appCnt = $appCnt -replace 'dependencies\s*\{', "dependencies {`n    implementation `"androidx.glance:glance-appwidget:1.1.0`"`n    implementation `"androidx.glance:glance-material3:1.1.0`"" }
    if ($appCnt -notmatch "play-services-ads") { $appCnt = $appCnt -replace 'dependencies\s*\{', "dependencies {`n    implementation `"com.google.android.gms:play-services-ads:22.6.0`"" }
    if ($appCnt -notmatch "androidx.multidex") { $appCnt = $appCnt -replace 'dependencies\s*\{', "dependencies {`n    implementation `"androidx.multidex:multidex:2.0.1`"" }
    if ($appCnt -notmatch "multiDexEnabled\s+true") { $appCnt = $appCnt -replace "defaultConfig\s*\{", "defaultConfig {`n        multiDexEnabled true" }
    if ($appCnt -notmatch "buildFeatures\s*\{[^}]*compose\s+true") {
        if ($appCnt -match "buildFeatures\s*\{") { $appCnt = $appCnt -replace "buildFeatures\s*\{", "buildFeatures {`n        compose true" }
        else { $appCnt = $appCnt -replace 'android\s*\{', "android {`n    buildFeatures {`n        compose true`n    }" }
    }
    $appCnt = [regex]::Replace($appCnt, '(?s)composeOptions\s*\{(?:[^{}]*|\{[^{}]*\})*\}', '')
    
    Set-Content $app $appCnt -NoNewline
}

foreach ($w in $receivers) {
    $x = $w.Xml
    $path = "android\app\src\main\res\xml\$x.xml"
    if (!(Test-Path $path)) {
        if (!(Test-Path (Split-Path $path -Parent))) { New-Item -ItemType Directory -Force (Split-Path $path -Parent) | Out-Null }
        Set-Content $path "<?xml version=`"1.0`" encoding=`"utf-8`"?><appwidget-provider xmlns:android=`"http://schemas.android.com/apk/res/android`" android:minWidth=`"110dp`" android:minHeight=`"110dp`" android:updatePeriodMillis=`"0`" android:initialLayout=`"@android:layout/simple_list_item_1`" android:resizeMode=`"horizontal|vertical`" android:widgetCategory=`"home_screen`" />"
    }
}

# Safe Widget Layout Fallbacks
$xmlResDir = "android\app\src\main\res\xml"
if (Test-Path $xmlResDir) {
    Get-ChildItem $xmlResDir -Filter "*.xml" | ForEach-Object {
        $c = Get-Content $_.FullName -Raw
        $matches = [regex]::Matches($c, 'android:initialLayout="(@layout/([^"]+))"')
        $mod = $false
        foreach ($m in $matches) {
            if (!(Test-Path "android\app\src\main\res\layout\$($m.Groups[2].Value).xml")) {
                $c = $c.Replace($m.Groups[1].Value, '@android:layout/simple_list_item_1')
                $mod = $true
            }
        }
        if ($mod) { Set-Content $_.FullName $c -NoNewline }
    }
}

# --- 6. Sync Capacitor ---
Write-Host "--- Syncing Android ---" -ForegroundColor Cyan
npx cap sync android

# --- 7. Fix Plugins ---
$admob = "node_modules\@capacitor-community\admob\android\build.gradle"
if (Test-Path $admob) {
    $admobCnt = Get-Content $admob -Raw
    $admobCnt = $admobCnt -replace "ext\.kotlin_version\s*=.*", "ext.kotlin_version = '2.0.21'"
    $admobCnt = $admobCnt -replace "classpath\s*`"org.jetbrains.kotlin:kotlin-gradle-plugin:[^`"]*`"", "classpath `"org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21`""
    $admobCnt = $admobCnt -replace "apply\s*plugin:\s*'kotlin-android'", "apply plugin: 'org.jetbrains.kotlin.android'"
    $admobCnt = $admobCnt -replace "sourceCompatibility\s*JavaVersion\.VERSION_21", "sourceCompatibility JavaVersion.VERSION_17"
    $admobCnt = $admobCnt -replace "targetCompatibility\s*JavaVersion\.VERSION_21", "targetCompatibility JavaVersion.VERSION_17"
    $admobCnt = $admobCnt -replace "jvmTarget\s*=\s*(?:JavaVersion\.VERSION_21|'21')", "jvmTarget = `"17`""
    if ($admobCnt -notmatch "Xskip-metadata-version-check") { $admobCnt += "`ntasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach { kotlinOptions { freeCompilerArgs += [`"-Xskip-metadata-version-check`"] } }" }
    Set-Content $admob $admobCnt -NoNewline
}

# --- 8. Safety Validation ---
$vFail = $false
if ((Get-Content "android\app\build.gradle" -Raw) -notmatch "play-services-ads") { Write-Warning "Missing play-services-ads"; $vFail=$true }
if ((Get-Content "android\build.gradle" -Raw) -notmatch "ext\.kotlin_version") { Write-Warning "Missing Kotlin version"; $vFail=$true }
if ((Get-Content "android\app\src\main\AndroidManifest.xml" -Raw) -notmatch "FOREGROUND_SERVICE") { Write-Warning "Missing FOREGROUND_SERVICE perm"; $vFail=$true }
if ($vFail) { Write-Warning "Validation warnings found." } else { Write-Host "Validation Passed." -ForegroundColor Green }


