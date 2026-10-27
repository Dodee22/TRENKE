# NDICam: iPhone -> NDI (Resolume, OBS, ...)

## 1. Vienkartinis paruošimas (Mac)
1. Xcode (App Store), tada `sudo xcode-select -s /Applications/Xcode.app` ir vieną kartą paleisk Xcode, kad įdiegtų komponentus.
2. Xcode -> Settings -> Accounts: pridėk savo Apple ID (vienintelis GUI žingsnis, reikalingas automatiniam pasirašymui).
3. Atsisiųsk ir įdiek **NDI SDK for Apple** iš https://ndi.video/for-developers/ndi-sdk/ (numatytai `/Library/NDI SDK for Apple`).
4. `cp local.env.example local.env` ir įrašyk savo `NDICAM_BUNDLE_ID`.

## 2. Build + įdiegimas
```
./run.sh
```
Skriptas: patikrina Xcode/xcodegen, suranda NDI SDK ir team id, sugeneruoja `NDICam.xcodeproj` iš `project.yml`,
sukompiliuoja, įdiegia ir paleidžia programą prijungtame iPhone.
Nemokamas Apple ID: programa galioja 7 dienas, prieš renginį tiesiog paleisk `./run.sh` iš naujo.

## 3. Pirmas paleidimas telefone
- Developer Mode: Settings -> Privacy & Security -> Developer Mode.
- Pasitikėjimas: Settings -> General -> VPN & Device Management -> tavo Apple ID -> Trust.
- Leisk kamerą ir Local Network.

## 4. Resolume
Sources -> NDI -> pasirink šaltinį „<kompiuterio/telefono vardas> (iPhone 15 Pro Max)“.

## 5. Patarimai renginiui
- Telefonas ir kompiuteris tame pačiame **5 GHz** tinkle, geriausia savo maršrutizatorius. Dar geriau: USB-C Ethernet adapteris telefonui.
- Pilnas NDI (SpeedHQ) 1080p60 ~ 125-150 Mbps, 4K gerokai daugiau. Per Wi-Fi 4K gali stringinėti, todėl 1080p60 saugiausia, 4K geriausia laidu.
- Įjunk Airplane Mode + Wi-Fi, išjunk Low Power Mode, naudok išorinį maitinimą (telefonas stipriai kaista).
- Rankinį ekspozicijos / WB / fokuso režimą naudok scenoje, kad vaizdas "neplaukiotų".
- Kodas siunčia BGRA (paprasta ir patikima). Vėliau galima optimizuoti į NV12/UYVY, kad sumažėtų CPU apkrova.
