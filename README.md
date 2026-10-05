# Zürich Marathon 2027 – Polar Dashboard

Komplette kleine Web-App mit:
- Polar AccessLink OAuth2-Anbindung
- serverseitigem Refresh-Token / Client Secret
- automatischem Abruf von Polar Training Sessions
- 27-Wochen-Plan bis Zürich Marathon 11.04.2027
- automatischer Zuordnung von Polar-Läufen zu den geplanten Einheiten
- Wochenkilometer, Pace, Ø Herzfrequenz und Polar Training Load
- adaptive Hinweise bei hoher Belastung oder auffälliger Herzfrequenz
- konfigurierbare HFmax, Ruhepuls und Zielpace
- Cron-Endpunkt für automatische Synchronisation ohne manuelles Öffnen

## 1. Polar-App anlegen

1. Polar Flow-Konto öffnen.
2. `https://admin.polaraccesslink.com` öffnen.
3. Eine AccessLink-App erstellen.
4. Als Redirect URL exakt `https://DEINE-DOMAIN/auth/polar/callback` eintragen.
5. Client ID und Client Secret kopieren.

## 2. Lokal starten

Voraussetzung: Node.js 20+.

```bash
cp .env.example .env
npm install
npm start
```

Dann `http://localhost:3000` öffnen.

In `.env` mindestens setzen:

```text
BASE_URL=http://localhost:3000
POLAR_CLIENT_ID=...
POLAR_CLIENT_SECRET=...
SYNC_SECRET=...
```

Für eine echte HTTPS-Deployment-URL müssen `BASE_URL` und die Polar Redirect URL dieselbe URL verwenden.

## 3. Automatische Synchronisation

Die App synchronisiert beim Polar-Connect und über den Button. Für echte Hintergrund-Synchronisation kann ein Hosting-Cron alle 30–60 Minuten aufrufen:

`GET /api/cron/sync?secret=DEIN_SYNC_SECRET`

Beispiel für einen Scheduler:

```text
https://DEINE-DOMAIN/api/cron/sync?secret=DEIN_SYNC_SECRET
```

## 4. Deployment

Geeignet sind z.B. Render, Railway, Fly.io oder ein eigener VPS. Wichtig:
- Node 20+
- dauerhafter Schreibzugriff auf `data/` für die einfache Einzelnutzer-Version
- HTTPS
- Umgebungsvariablen aus `.env`
- Polar Redirect URL exakt auf die öffentliche Callback-URL setzen

Für mehrere Nutzer sollte die JSON-Speicherung durch eine Datenbank und eine echte Session-/Token-Tabelle ersetzt werden.

## Adaptive Logik

Die App verändert den Trainingsplan nicht blind anhand eines einzelnen Laufs. Sie bewertet:
- Wochenkilometer
- Polar Training Load
- durchschnittliche Herzfrequenz
- Erfüllung der geplanten 3 Läufe
- Nähe von tatsächlichem Laufdatum zur geplanten Einheit

Bei hoher Belastung empfiehlt sie eine Reduktion der nächsten harten Einheit; versäumte Einheiten werden nicht automatisch nachgeholt.

## Datenschutz

Das Polar Client Secret und der Refresh Token liegen ausschließlich serverseitig. Die Demo speichert Trainingsdaten lokal in `data/polar.json`. Für eine öffentliche Mehrbenutzer-App sollte eine verschlüsselte Token-/DB-Lösung verwendet werden.
