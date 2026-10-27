#!/usr/bin/env bash
# NDICam: sugeneruoja projektą, sukompiliuoja, įdiegia ir paleidžia prijungtame iPhone.
# Asmeniniai nustatymai imami iš local.env (necommitinamas, žr. local.env.example).
set -euo pipefail
cd "$(dirname "$0")"

[ -f local.env ] && source local.env
NDI_SDK_DIR="${NDI_SDK_DIR:-/Library/NDI SDK for Apple}"
: "${NDICAM_BUNDLE_ID:?Įrašyk NDICAM_BUNDLE_ID į local.env (pvz. com.tavovardas.ndicam)}"

# 1. Aplinka
command -v xcodebuild >/dev/null || { echo "Nėra Xcode. Įdiek iš App Store, tada: sudo xcode-select -s /Applications/Xcode.app"; exit 1; }
xcodebuild -version
command -v xcodegen >/dev/null || brew install xcodegen

# 2. NDI SDK (.a arba .xcframework viduje esanti ios-arm64 biblioteka)
if [ -f "$NDI_SDK_DIR/include/Processing.NDI.Lib.h" ]; then
  NDI_INCLUDE_DIR="$NDI_SDK_DIR/include"
else
  NDI_INCLUDE_DIR="$(dirname "$(find "$NDI_SDK_DIR" -name Processing.NDI.Lib.h 2>/dev/null | head -n1 || true)")"
fi
NDI_LIB="$(find "$NDI_SDK_DIR" -name libndi_ios.a -not -path '*simulator*' 2>/dev/null | head -n1 || true)"
if [ ! -f "$NDI_INCLUDE_DIR/Processing.NDI.Lib.h" ] || [ -z "$NDI_LIB" ]; then
  echo "NDI SDK nerastas: $NDI_SDK_DIR"
  echo "Atsisiųsk 'NDI SDK for Apple' iš https://ndi.video/for-developers/ndi-sdk/, įdiek .pkg"
  echo "(numatytai į /Library/NDI SDK for Apple) arba nurodyk NDI_SDK_DIR local.env faile."
  exit 1
fi
NDI_LIB_DIR="$(dirname "$NDI_LIB")"
echo "NDI: $NDI_INCLUDE_DIR | $NDI_LIB"

# 3. Komanda (team id): local.env arba Apple Development sertifikato OU laukas
if [ -z "${DEVELOPMENT_TEAM:-}" ]; then
  DEVELOPMENT_TEAM="$(security find-certificate -c "Apple Development" -p 2>/dev/null \
    | openssl x509 -noout -subject 2>/dev/null \
    | sed -n 's/.*OU *= *\([A-Z0-9]\{10\}\).*/\1/p' | head -n1 || true)"
fi
: "${DEVELOPMENT_TEAM:?Nerastas team id. Xcode -> Settings -> Accounts pridėk Apple ID (vieną kartą), arba įrašyk DEVELOPMENT_TEAM į local.env}"
echo "Team: $DEVELOPMENT_TEAM"

# 4. Įrenginys
DEVJSON="$(mktemp)"
xcrun devicectl list devices --json-output "$DEVJSON" >/dev/null
read -r DEVICE_ID DEVICE_UDID DEV_STATE DEV_MODE <<<"$(python3 - "$DEVJSON" <<'PY'
import json, sys
devs = [d for d in json.load(open(sys.argv[1])).get("result", {}).get("devices", [])
        if d.get("hardwareProperties", {}).get("platform") == "iOS"]
devs.sort(key=lambda d: d.get("connectionProperties", {}).get("tunnelState") != "connected")
if devs:
    d = devs[0]
    print(d["identifier"], d["hardwareProperties"].get("udid", "-"),
          d.get("connectionProperties", {}).get("tunnelState", "-"),
          d.get("deviceProperties", {}).get("developerModeStatus", "-"))
else:
    print("- - - -")
PY
)"
rm -f "$DEVJSON"
if [ "$DEVICE_ID" = "-" ]; then
  cat <<'EOF'
iPhone nerastas. Telefone:
  1. Prijunk USB-C kabeliu, atrakink, paspausk "Trust This Computer" ir įvesk kodą.
  2. Jei Xcode dar nematė telefono: palauk, kol baigs "Preparing device" (xcrun devicectl list devices).
  3. Paleisk ./run.sh dar kartą.
EOF
  exit 1
fi
if [ "$DEV_MODE" != "enabled" ]; then
  cat <<'EOF'
Įjunk Developer Mode telefone:
  Settings -> Privacy & Security -> Developer Mode -> ON -> Restart,
  po perkrovimo patvirtink "Turn On" ir įvesk kodą. Tada paleisk ./run.sh dar kartą.
  (Jei meniu nėra: pirmiau paleisk ./run.sh vieną kartą su prijungtu telefonu, kad Xcode jį pamatytų.)
EOF
  exit 1
fi
echo "iPhone: $DEVICE_ID ($DEV_STATE)"

# 5. Build (konkretus įrenginys, kad nemokamas profilis jį užregistruotų)
xcodegen generate
xcodebuild -project NDICam.xcodeproj -scheme NDICam -configuration Release \
  -destination "id=$DEVICE_UDID" -derivedDataPath build \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" PRODUCT_BUNDLE_IDENTIFIER="$NDICAM_BUNDLE_ID" \
  NDI_INCLUDE_DIR="$NDI_INCLUDE_DIR" NDI_LIB_DIR="$NDI_LIB_DIR" \
  build

# 6. Įdiegimas ir paleidimas
APP="build/Build/Products/Release-iphoneos/NDICam.app"
xcrun devicectl device install app --device "$DEVICE_ID" "$APP"
if ! xcrun devicectl device process launch --device "$DEVICE_ID" --terminate-existing "$NDICAM_BUNDLE_ID"; then
  cat <<'EOF'
Įdiegta, bet nepasileido. Jei klaida apie "profile has not been explicitly trusted":
  Settings -> General -> VPN & Device Management -> (tavo Apple ID) -> Trust.
  Tada atidaryk NDICam telefone arba paleisk ./run.sh dar kartą.
EOF
  exit 1
fi
echo "NDICam paleista."
