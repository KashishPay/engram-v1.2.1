# ==============================================================================
# ENGRAM ANDROID BUILD AUTOMATOR (Iterated v1.7)
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
& robocopy $from $repo /E /MT:32 /XD node_modules dist .git android ios /XF .env.local | Out-Null
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
if (Test-Path "package-lock.json") { Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue }

Write-Output "Running base npm install..."
npm install

Write-Output "Ensuring critical dependencies are installed..."
# Install Core App Features
npm install react react-dom lucide-react @google/genai @supabase/supabase-js katex dompurify jspdf pdfjs-dist@3.11.174 react-markdown remark-gfm remark-math rehype-katex d3

# Install Capacitor Plugins (Core + Community)
npm install @capacitor/core @capacitor/app @capacitor/filesystem @capacitor/share @capacitor/local-notifications @capacitor/haptics @capacitor/camera @capacitor/android @capacitor/ios @capacitor-community/admob @capacitor-community/keep-awake

# Install Dev Tools & Linters
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/d3 autoprefixer postcss tailwindcss @capacitor/cli @capacitor/assets eslint eslint-plugin-react-hooks eslint-plugin-react-refresh @typescript-eslint/eslint-plugin @typescript-eslint/parser

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
    # 1. Fix "VANILLA_ICE_CREAM" and AdMob errors by bumping SDK versions
    $varsFile = "android\variables.gradle"
    if (Test-Path $varsFile) {
        $varsContent = Get-Content $varsFile -Raw
        $varsContent = $varsContent -replace 'compileSdkVersion = \d+', 'compileSdkVersion = 35'
        $varsContent = $varsContent -replace 'targetSdkVersion = \d+', 'targetSdkVersion = 35'
        $varsContent = $varsContent -replace 'minSdkVersion = \d+', 'minSdkVersion = 24'
        Set-Content -Path $varsFile -Value $varsContent
        Write-Output "Updated variables.gradle (compile/target=35, min=24)."
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

    # 4. Inject AdMob App ID into AndroidManifest.xml to prevent startup crash
    $manifestFile = "android\app\src\main\AndroidManifest.xml"
    if (Test-Path $manifestFile) {
        $manifestContent = Get-Content $manifestFile -Raw
        if ($manifestContent -notmatch "com.google.android.gms.ads.APPLICATION_ID") {
            # Using your real App ID: ca-app-pub-1930133918087114~6997595405
            $admobMeta = "`n        <meta-data android:name=`"com.google.android.gms.ads.APPLICATION_ID`" android:value=`"ca-app-pub-1930133918087114~6997595405`"/>"
            $manifestContent = $manifestContent -replace '<application([^>]*)>', "<application`$1>$admobMeta"
            Set-Content -Path $manifestFile -Value $manifestContent
            Write-Output "Injected AdMob App ID into AndroidManifest.xml."
        }
    }
}

# 10) Sync & Launch
Write-Output "--- Step 10: Syncing to Android ---"
npx cap sync android

Write-Output "--- FINISHED ---"
Write-Output "1. Opening Android Studio..."
Write-Output "2. IMPORTANT: In Android Studio, go to Settings -> Build, Execution, Deployment -> Build Tools -> Gradle"
Write-Output "3. Ensure 'Gradle JDK' is set to version 21 (or 17+)."
npx cap open android
