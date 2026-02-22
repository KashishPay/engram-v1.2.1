# 1) Define Paths
$zip  = "$env:USERPROFILE\Downloads\engram-v1.2.1.zip"
$src  = "$env:USERPROFILE\Desktop\engram-v1.2.1_extracted"
$repo = "$env:USERPROFILE\Desktop\engram_audit"

# 2) Clean & Extract
Write-Output "Cleaning workspace..."
Remove-Item $src -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $repo -Recurse -Force -ErrorAction SilentlyContinue

Write-Output "Extracting ZIP..."
Expand-Archive -Path $zip -DestinationPath $src -Force

# 3) Copy code to repo (exclude junk)
Write-Output "Copying files..."
New-Item -ItemType Directory -Force -Path $repo | Out-Null
robocopy $src $repo /E /XD node_modules dist .git /XF .env.local
cd $repo

# 4) Fix Scripts & Create PDF Worker Helper
Write-Output "Configuring scripts..."
npm pkg set type="module"
npm pkg set scripts.dev="vite"
npm pkg set scripts.build="vite build"
npm pkg set scripts.preview="vite preview"

New-Item -ItemType Directory -Force -Path .\scripts | Out-Null
@'
const fs = require("fs");
const path = require("path");
// Ensure target directory exists
const destDir = path.join("public");
if (!fs.existsSync(destDir)){ fs.mkdirSync(destDir, { recursive: true }); }

// Copy Worker
const src = path.join("node_modules","pdfjs-dist","build","pdf.worker.min.js");
const dst = path.join("public","pdf.worker.min.js");

if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log("PDF Worker copied successfully.");
} else {
    console.log("Waiting for npm install to finish...");
}
'@ | Set-Content -Encoding UTF8 .\scripts\copy-pdf-worker.cjs

# Add postinstall hook
npm pkg set "scripts.postinstall=node scripts/copy-pdf-worker.cjs"

# 5) Clean Install ALL Dependencies (Web + Capacitor)
Write-Output "Installing Dependencies (Web & Mobile)..."
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue

# Core & Build
npm install react react-dom
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom autoprefixer postcss tailwindcss

# App Features (Updated to include Markdown dependencies)
npm install lucide-react @google/genai @supabase/supabase-js katex dompurify jspdf pdfjs-dist@3.11.174 react-markdown remark-gfm remark-math rehype-katex

# Capacitor Core (Native Bridge)
npm install @capacitor/core @capacitor/app @capacitor/filesystem @capacitor/share @capacitor/local-notifications @capacitor/haptics @capacitor/camera @capacitor/background-task

# Capacitor Platforms & Tools
npm install @capacitor/android @capacitor/ios
npm install -D @capacitor/cli @capacitor/assets

# 6) Build Web App
Write-Output "Building Web Assets..."
# Trigger postinstall manually just in case
node scripts/copy-pdf-worker.cjs
npm run build

# 7) Add Android Platform
Write-Output "Initializing Android..."
npx cap add android

# 8) Auto-Generate App Icons (The "Icon Thingy")
Write-Output "Generating App Icons..."
New-Item -ItemType Directory -Force -Path "assets" | Out-Null

$LogoSource = "public\brand\engram_logo\engram_logo_512.png"

if (Test-Path $LogoSource) {
    Copy-Item $LogoSource "assets\icon.png" -Force
    Copy-Item $LogoSource "assets\splash.png" -Force
    Copy-Item $LogoSource "assets\splash-dark.png" -Force
    
    # Generate the Android resources
    npx capacitor-assets generate --android
    Write-Output "Icons created."
} else {
    Write-Output "Warning: Logo not found at $LogoSource. Skipping custom icons."
}

# 9) Sync & Launch
Write-Output "Syncing to Android..."
npx cap sync

Write-Output "Launching Android Studio..."
npx cap open android