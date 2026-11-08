# Sudhelfer Einkochtopf

Eine Web-App, die Hobbybrauer Schritt für Schritt durch einen Brautag im Einkochtopf führt: vom Einmaischen bis zum Abfüllen. Sie liest Rezepte von [maischemalzundmehr.de](https://www.maischemalzundmehr.de/) sowie BeerXML- und BeerJSON-Dateien und macht daraus einen eindeutigen Ablauf mit gut lesbarer Anzeige der Zieltemperatur, Rühranzeige, Timern und Bestätigung jedes Schritts.

**Direkt im Browser nutzen: [danielmenzel.de/sudhelfer](https://danielmenzel.de/sudhelfer/)**. Läuft auf Laptop, Tablet und Handy und lässt sich auf iPhone, iPad und Android als App auf den Home-Bildschirm legen, danach auch offline.

Alternativ für Laptop und PC: **[sudhelfer.html herunterladen](https://github.com/Zebrazeh/sudhelfer/releases/latest/download/sudhelfer.html)**. Die ganze App ist eine einzige HTML-Datei, die im Browser auch ohne Internet läuft.

> **Hinweis:** Sudhelfer ist ein privates Hobby-Projekt. Es steht in keiner Verbindung zu maischemalzundmehr.de und ist kein offizielles Angebot der Seite. Die Rezepte stammen von den jeweiligen Autorinnen und Autoren.

## So sieht es aus

**Übersicht** nach dem Laden eines Rezepts (Laptop):

<img src="docs/screenshots/1-uebersicht-laptop.png" alt="Übersicht mit Kennzahlen und Brauablauf" width="800">

**Brau-Modus** (Handy): links eine Rast mit Anzeige der Zieltemperatur, Rühranzeige und Timer, rechts der Stammwürze-Rechner mit Mischkreuz.

<p>
<img src="docs/screenshots/2-rast-handy.png" alt="Rast im Brau-Modus auf dem Handy" width="300">
&nbsp;&nbsp;
<img src="docs/screenshots/4-stammwuerze-rechner-handy.png" alt="Stammwürze-Rechner auf dem Handy" width="300">
</p>

**Hopfengabe beim Kochen** (Tablet quer):

<img src="docs/screenshots/3-kochen-tablet.png" alt="Hopfengabe beim Kochen auf dem Tablet" width="800">

**Nach dem Abfüllen:** Alkoholgehalt nach der Flaschengärung berechnen und Flaschenetikett drucken:

<img src="docs/screenshots/5-nach-dem-abfuellen-laptop.png" alt="Abschluss mit Alkoholberechnung und Etikett" width="800">

## Funktionen

- **Rezepte laden**
  - JSON-Export von maischemalzundmehr.de (Exportversion 1 und 2, auch Dekoktion)
  - QR-Code einer Rezeptseite von maischemalzundmehr.de fotografieren, dann führt die App zum passenden JSON-Export
  - BeerXML 1.0 (z. B. aus BeerSmith, Brewfather, Kleiner Brauhelfer, Brewer's Friend)
  - BeerJSON 1.0
- **Übersicht:** Kennzahlen, Phasen, Maischplan-Diagramm, Kochplan mit Zugabezeitpunkten, Umrechnen auf die eigene Sudgröße
- **Brau-Modus:** große Anzeige der Zieltemperatur mit Hinweis, was zu tun ist (Heizen, Halten, Kochen, Kühlen, Aus), Anzeige ob gerührt wird, Timer mit Ton, jeder Schritt mit Häkchen und OK bestätigt, Zurückgehen jederzeit möglich
- **Ablauf bis zum Schluss:** Vorbereitung, Maischen mit Jodprobe, Läutern, Kochen, Whirlpool, Abkühlen ohne aktive Kühlung, Anstellen, Hauptgärung, Hopfenstopfen, Endvergärung, Abfüllen, Nachgärung
- **Rechner:** Stammwürze mit Temperaturkorrektur und Mischkreuz (Verdünnen oder Aufzuckern), Zucker für die Flaschengärung, Alkoholgehalt nach der Flaschengärung
- **Ausgabe:** Brauprotokoll als PDF zum Ausdrucken, Flaschenetikett als PNG (einzeln oder A4-Bogen)
- Fortschritt, Timer und Eingaben werden im Browser gespeichert. Ein Neuladen der Seite ist sicher.

## Benutzung

### iPhone und iPad

1. In **Safari** [danielmenzel.de/sudhelfer](https://danielmenzel.de/sudhelfer/) öffnen.
2. Auf **Teilen** tippen (Quadrat mit Pfeil nach oben), dann **„Zum Home-Bildschirm“** und **„Hinzufügen“**.
3. Den Sudhelfer einmal über das neue Symbol mit Internet öffnen. Ab dann startet er auch ohne Netz, zum Beispiel in der Garage oder im Keller.

Gut zu wissen:

- Die heruntergeladene Datei `sudhelfer.html` funktioniert auf iPhone und iPad **nicht**. iOS zeigt lokale HTML-Dateien nur in einer Vorschau ohne JavaScript an, die Seite bleibt leer. Deshalb den Weg über den Link oben nehmen.
- Während eines Brauschritts bleibt der Bildschirm an. Für den Timer-Ton oben auf **„Ton an“** tippen und den Stummschalter am Gerät prüfen.
- Die App auf dem Home-Bildschirm und Safari speichern getrennt. Ein Sud, der in Safari begonnen wurde, ist im Home-Bildschirm-Symbol nicht zu sehen. Am besten immer dasselbe benutzen.
- Vor dem ersten Brautag einmal im Flugmodus testen, ob der Sudhelfer startet.

### Android

1. In **Chrome** [danielmenzel.de/sudhelfer](https://danielmenzel.de/sudhelfer/) öffnen.
2. Über das Menü (drei Punkte) **„Zum Startbildschirm hinzufügen“** bzw. **„App installieren“** wählen.
3. Einmal mit Internet öffnen, danach läuft er auch offline.

### Laptop und PC

- Entweder [danielmenzel.de/sudhelfer](https://danielmenzel.de/sudhelfer/) im Browser öffnen
- oder **[sudhelfer.html herunterladen](https://github.com/Zebrazeh/sudhelfer/releases/latest/download/sudhelfer.html)** und per Doppelklick im Browser öffnen. Die Datei läuft komplett offline.

### Brauen

1. Rezept laden: Datei wählen, Text einfügen oder QR-Code scannen.
2. Übersicht prüfen, die Hinweise zum Rezept lesen, auf **Start** tippen.
3. Jeden Schritt abarbeiten, abhaken und mit **OK** bestätigen.

Zum Ausprobieren lädt die App beim ersten Öffnen ein selbst zusammengestelltes Beispielrezept (Belgisches Blond). Weitere Beispieldateien liegen in [`examples/`](examples/).

## Sicherheit

Flaschengärung kann gefährlich sein: Zu viel Zucker oder nicht endvergorenes Bier erzeugt in der Flasche zu viel Druck, Flaschen können platzen. Die Rezepte auf Rezeptseiten sind ungeprüfte Hobby-Rezepte und können Fehler enthalten. Alle Werte der App sind Näherungen ohne Gewähr. **Du braust auf eigene Verantwortung.**

## Datenschutz

Rezepte, Messwerte und Fortschritt bleiben im Browser auf deinem Gerät. Die App schickt nichts an einen Server und lädt nichts von fremden Adressen nach. Einzige Ausnahme ist der Link „JSON-Export öffnen“ zu maischemalzundmehr.de, den du selbst antippst. Für die Online-Version unter danielmenzel.de gelten Impressum und Datenschutzerklärung, die in der App verlinkt sind.

## Aufbau des Quellcodes

| Datei | Inhalt |
|---|---|
| `index.html` | fertige App als eine Datei, wird von `build.py` erzeugt (dieselbe Datei wie der Download) |
| `src/app.html` | Oberfläche, Stile, Rechner, PDF- und Etikett-Erzeugung |
| `src/core.js` | Rezept-Import (maischemalzundmehr.de, BeerXML, BeerJSON) und Erzeugung der Brauschritte |
| `vendor/jsQR-1.4.0.js` | QR-Erkennung, unverändert übernommen |
| `web/` | Zusatzdateien für die Online-Version: Service Worker (`sw.js`) für den Offline-Betrieb, Manifest und Icons für den Home-Bildschirm |
| `build.py` | baut die App aus den Teilen zusammen |
| `examples/` | Beispielrezepte in allen drei Formaten |

**Eine Datei bauen:** `python3 build.py` erzeugt `index.html`.

**Eigene Online-Version bauen:** `python3 build.py --web ZIELORDNER --legal-url https://example.org/impressum` erzeugt im Zielordner `index.html`, `sw.js`, `manifest.webmanifest` und drei Icons. Diese sechs Dateien gemeinsam in einen Ordner auf dem eigenen Webspace legen. Der Webspace braucht **HTTPS**, sonst laufen Offline-Betrieb und „Bildschirm bleibt an“ nicht. `--legal-url` setzt in der App einen Link „Impressum & Datenschutz“. Bei jeder neuen Version alle sechs Dateien neu hochladen.

## Lizenz

© 2026 Daniel Menzel. Veröffentlicht unter der [MIT-Lizenz](LICENSE). Erstellt mit Unterstützung von Claude (Anthropic).

Enthaltene Fremdsoftware: [jsQR](https://github.com/cozmo/jsQR) 1.4.0 unter der Apache License 2.0, siehe [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).
