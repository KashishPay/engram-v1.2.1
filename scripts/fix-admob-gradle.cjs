const fs = require('fs');
const path = require('path');

const admobPluginGradle = path.join('node_modules', '@capacitor-community', 'admob', 'android', 'build.gradle');

if (fs.existsSync(admobPluginGradle)) {
    let admobContent = fs.readFileSync(admobPluginGradle, 'utf8');

    // 1. Update kotlin plugin notation (no explicit version required as root has it)
    admobContent = admobContent.replace(/ext\.kotlin_version\s*=.*/g, "ext.kotlin_version = '2.0.21'");
    admobContent = admobContent.replace(/classpath\s*"org\.jetbrains\.kotlin:kotlin-gradle-plugin:[^"]*"/g, 'classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21"');
    admobContent = admobContent.replace(/apply\s*plugin:\s*'kotlin-android'/g, "apply plugin: 'org.jetbrains.kotlin.android'");

    // 2. Enforce java/kotlin 17
    admobContent = admobContent.replace(/sourceCompatibility\s*JavaVersion\.VERSION_21/g, "sourceCompatibility JavaVersion.VERSION_17");
    admobContent = admobContent.replace(/targetCompatibility\s*JavaVersion\.VERSION_21/g, "targetCompatibility JavaVersion.VERSION_17");
    admobContent = admobContent.replace(/jvmTarget\s*=\s*(?:JavaVersion\.VERSION_21|'21')/g, 'jvmTarget = "17"');

    // 3. Add compiler argument to skip metadata validation
    if (!admobContent.includes("Xskip-metadata-version-check")) {
        admobContent += "\n\ntasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {\n    kotlinOptions {\n        freeCompilerArgs += [\"-Xskip-metadata-version-check\"]\n    }\n}\n";
    }

    fs.writeFileSync(admobPluginGradle, admobContent, 'utf8');
    console.log("AdMob plugin aligned to Kotlin 2.0.21 and Java 17.");
} else {
    console.warn("Notice: AdMob plugin build.gradle not found. Skipping fix.");
}
