# Belegsammler MVP

Eine kleine installierbare Web-App, die Belegfotos ausschließlich lokal im Browser (`IndexedDB`) speichert.

## Starten

Eine PWA benötigt HTTPS (oder `localhost`). Die Dateien daher nicht nur per Doppelklick öffnen, sondern auf einen statischen Webhost laden, z. B. GitHub Pages, Cloudflare Pages oder Netlify. Eine eigene Domain ist nicht nötig.

Für einen lokalen Test im Projektordner:

```bash
python -m http.server 8080
```

Danach `http://localhost:8080` öffnen. Auf iPhone: in Safari **Teilen → Zum Home-Bildschirm**. Auf Android: im Browsermenü **App installieren** bzw. **Zum Startbildschirm hinzufügen**.

## Funktionen

- Foto direkt mit der Kamera oder aus der Bildbibliothek übernehmen
- automatische laufende ID und Erfassungszeit
- optionale, automatisch gespeicherte Notiz
- lokale Speicherung in IndexedDB
- Einzel- und Gesamtlöschung mit Rückfrage
- ZIP-Export aller Bilder plus `belege.csv`
- nativer Teilen-Dialog, sofern Browser und Gerät das Teilen von Dateien unterstützen
- App-Shell nach dem ersten erfolgreichen Laden offline verfügbar

## Wichtige Grenzen

- Browserdaten sind kein dauerhaftes Backup. Vor Gerätewechsel, Browser-Reset oder längerer Ablage regelmäßig exportieren.
- Daten werden nicht zwischen Geräten synchronisiert.
- Erfasst wird die Aufnahmezeit, nicht automatisch das aufgedruckte Belegdatum.
- OCR, Cloud-Backup und Mehrgeräte-Synchronisation sind bewusst nicht Teil dieses MVP.
