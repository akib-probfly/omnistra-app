$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
if (-not (Test-Path $sdk)) {
  throw "Android SDK not found at $sdk"
}

$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:GRADLE_USER_HOME = "C:\gradle"
$env:TEMP = "C:\tmp"
$env:TMP = "C:\tmp"
New-Item -ItemType Directory -Force -Path "C:\gradle", "C:\tmp" | Out-Null
$env:EXPO_PUBLIC_API_BASE_URL = "https://api.zurvis.io/api/v1"
$env:ORG_GRADLE_PROJECT_reactNativeArchitectures = "armeabi-v7a,arm64-v8a"
if (-not $env:JAVA_HOME) {
  $env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"
}

$signingDir = Join-Path $root ".signing"
$keystore = Join-Path $signingDir "zurvis-upload.jks"
$credsFile = Join-Path $signingDir "credentials.json"
New-Item -ItemType Directory -Force -Path $signingDir | Out-Null

if (-not (Test-Path $keystore)) {
  $password = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 28 | ForEach-Object { [char]$_ })
  $keytool = Join-Path $env:JAVA_HOME "bin\keytool.exe"
  & $keytool -genkeypair -noprompt -storetype JKS `
    -keystore $keystore `
    -alias zurvis-upload `
    -keyalg RSA -keysize 2048 -validity 10000 `
    -storepass $password -keypass $password `
    -dname "CN=Zurvis, OU=Mobile, O=Zurvis, C=US"
  if ($LASTEXITCODE -ne 0) { throw "keytool failed" }

  @{
    storeFile     = ".signing/zurvis-upload.jks"
    keyAlias      = "zurvis-upload"
    storePassword = $password
    keyPassword   = $password
  } | ConvertTo-Json | Set-Content -Path $credsFile -Encoding utf8
}

$creds = Get-Content $credsFile -Raw | ConvertFrom-Json

Write-Host "Running expo prebuild..."
$env:CI = "1"
npx expo prebuild --platform android --clean --non-interactive
if ($LASTEXITCODE -ne 0) { throw "expo prebuild failed" }

$sdkDirProp = ($sdk -replace '\\', '\\')
Set-Content -Path (Join-Path $root "android\local.properties") -Value "sdk.dir=$sdkDirProp" -Encoding ascii

$appGradle = Join-Path $root "android\app\build.gradle"
$gradleProps = Join-Path $root "android\gradle.properties"

Copy-Item $keystore (Join-Path $root "android\app\zurvis-upload.jks") -Force

$props = Get-Content $gradleProps -Raw
if ($props -notmatch "MYAPP_UPLOAD_STORE_FILE") {
  Add-Content $gradleProps @"

MYAPP_UPLOAD_STORE_FILE=zurvis-upload.jks
MYAPP_UPLOAD_KEY_ALIAS=$($creds.keyAlias)
MYAPP_UPLOAD_STORE_PASSWORD=$($creds.storePassword)
MYAPP_UPLOAD_KEY_PASSWORD=$($creds.keyPassword)
"@
}

$gradle = Get-Content $appGradle -Raw
if ($gradle -notmatch "signingConfigs.release" -and $gradle -notmatch "MYAPP_UPLOAD_STORE_FILE") {
  $gradle = $gradle.Replace(
    "            keyPassword 'android'`r`n        }`r`n    }",
    "            keyPassword 'android'`r`n        }`r`n        release {`r`n            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {`r`n                storeFile file(MYAPP_UPLOAD_STORE_FILE)`r`n                storePassword MYAPP_UPLOAD_STORE_PASSWORD`r`n                keyAlias MYAPP_UPLOAD_KEY_ALIAS`r`n                keyPassword MYAPP_UPLOAD_KEY_PASSWORD`r`n            }`r`n        }`r`n    }"
  )
  if ($gradle -eq (Get-Content $appGradle -Raw)) {
    $gradle = (Get-Content $appGradle -Raw).Replace(
      "            keyPassword 'android'`n        }`n    }",
      "            keyPassword 'android'`n        }`n        release {`n            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {`n                storeFile file(MYAPP_UPLOAD_STORE_FILE)`n                storePassword MYAPP_UPLOAD_STORE_PASSWORD`n                keyAlias MYAPP_UPLOAD_KEY_ALIAS`n                keyPassword MYAPP_UPLOAD_KEY_PASSWORD`n            }`n        }`n    }"
    )
  }
  $gradle = $gradle.Replace("signingConfig signingConfigs.debug", "signingConfig signingConfigs.release")
  # Keep debug variant on the debug keystore.
  $gradle = $gradle.Replace(
    "        debug {`r`n            signingConfig signingConfigs.release",
    "        debug {`r`n            signingConfig signingConfigs.debug"
  )
  $gradle = $gradle.Replace(
    "        debug {`n            signingConfig signingConfigs.release",
    "        debug {`n            signingConfig signingConfigs.debug"
  )
  Set-Content -Path $appGradle -Value $gradle -NoNewline -Encoding utf8
}

$googleServices = Join-Path $root "google-services.json"
if (Test-Path $googleServices) {
  Copy-Item $googleServices (Join-Path $root "android\app\google-services.json") -Force
}

Write-Host "Building release AAB and APK..."
Set-Location (Join-Path $root "android")
.\gradlew.bat app:bundleRelease app:assembleRelease --no-daemon
if ($LASTEXITCODE -ne 0) { throw "Gradle release build failed" }

$aab = Join-Path $root "android\app\build\outputs\bundle\release\app-release.aab"
$apk = Join-Path $root "android\app\build\outputs\apk\release\app-release.apk"
Write-Host "AAB: $aab"
Write-Host "APK: $apk"
if (Test-Path $aab) { Write-Host ("AAB size: {0:N1} MB" -f ((Get-Item $aab).Length / 1MB)) }
if (Test-Path $apk) { Write-Host ("APK size: {0:N1} MB" -f ((Get-Item $apk).Length / 1MB)) }

Write-Host ""
Write-Host "Play Store: upload the AAB. For the same signing key as EAS, run: eas credentials -p android"
Write-Host "and download the keystore into .signing/ before building (see scripts/build-android-release.ps1)."
