# 📦 Sandėlio krovimas

Paprasta telefono programėlė (PWA), skirta susižymėti, **kokią įrangą reikia
pasikrauti rytoj išvykstant iš sandėlio**. Kraunant įrangą tiesiog žymi
varneles — matai progresą realiu laiku.

Kiekvienas įrašas turi tris stulpelius:

| Stulpelis | Reikšmė |
|-----------|---------|
| **Sandėlis** | iš kurio sandėlio / vietos imama įranga |
| **Įranga** | įrangos pavadinimas |
| **Kiekis** | kiek vienetų |

Prie kiekvieno įrašo yra **varnelė** — pažymi, kai pakrauni.

## Ypatybės

- ✅ Varnelės kraunant + progreso juosta (kiek jau pakrauta)
- 💾 Duomenys saugomi **jūsų telefone** (`localStorage`) — niekur nesiunčiami
- 📴 **Veikia be interneto** (offline) po pirmo atidarymo
- 📲 **Įsidiegia į pradžios ekraną** kaip įprasta programėlė
- 🔎 Filtras: visi / nepakrauti / pakrauti
- 🌗 Palaiko tamsų režimą
- 🇱🇹 Lietuviška sąsaja

## Kaip įsidiegti į telefoną

Tai **PWA** — įsidiegia tiesiai iš naršyklės, App Store / Google Play nereikia.

### 1. Paleisk „GitHub Pages" (vieną kartą)
Repozitorijos nustatymuose: **Settings → Pages → Build and deployment →
Source: „GitHub Actions"**. Po `push` programėlė pasidarys pasiekiama adresu:

```
https://<naudotojas>.github.io/<repozitorija>/
```

### 2. Įsidiek telefone
- **iPhone (Safari):** atidaryk adresą → mygtukas **Bendrinti (Share)** →
  **„Į pradžios ekraną" (Add to Home Screen)**.
- **Android (Chrome):** atidaryk adresą → meniu **⋮** →
  **„Įdiegti programą" (Install app)** (arba pasirodys mygtukas **Įdiegti**).

Po to programėlę atidarysi kaip bet kurią kitą — ikona bus pradžios ekrane,
veiks ir be interneto.

## Paleidimas lokaliai (bandymui)

```bash
python3 -m http.server 8000
# atidaryk http://localhost:8000
```

## Failai

```
index.html      – sąsaja
styles.css      – stilius (mobile-first)
app.js          – logika + duomenų saugojimas
manifest.json   – PWA aprašas (įdiegimui)
sw.js           – service worker (veikimas be interneto)
icons/          – programėlės ikonos
```
