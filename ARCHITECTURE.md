# NoVoice — Architecture & Infrastructure Plan

## Vision

NoVoice ist eine datenschutzorientierte, Open-Source Alternative zu Discord.
Nutzer melden sich zentral an, aber die eigentliche Kommunikation kann über
verschiedene Hosting-Modelle laufen. Private Nachrichten werden **niemals**
auf dem Server gespeichert.

---

## Hosting-Modelle

### 1. NoVoice Cloud (zentral, auf Hetzner)
- Nutzer registrieren sich auf `novoice.app`
- Account-Daten (Username, Password-Hash, Avatar) liegen auf deinem Hetzner-Server
- Server-Channels (öffentliche Nachrichten) werden ebenfalls zentral gespeichert
- **DMs: Nur Relay — kein Speichern** (siehe unten)
- **Vorteil:** Einfache Nutzung, kein technisches Wissen nötig

### 2. Self-Hosted (eigener Server)
- Jeder kann die komplette `server/`-Codebase selbst hosten
- Nutzer auf einem Self-Hosted Server haben **eigene Accounts** (kein zentrales Login)
- Geeignet für Teams, Firmen, Communities mit eigenem Server
- **Vorteil:** Volle Kontrolle, kein Vertrauen nötig

### 3. Local / P2P (später, Roadmap)
- App läuft lokal, verbindet sich direkt mit Freunden (WebRTC ohne Server)
- Nur für DMs zwischen zwei Nutzern die beide online sind
- **Vorteil:** Maximale Privatsphäre, kein Server nötig

---

## Datenschutz-Architektur: DMs ohne Speichern

### Problem
DMs zwischen Nutzern sollen **nicht** auf dem Server gespeichert werden.
Der Server soll sie nur weiterleiten (Relay).

### Lösung: Client-Side Encryption + Relay

```
Sender ──(verschlüsselt)──► Server ──(relay, no-save)──► Empfänger
                               │
                        Speichert NICHT
```

#### Implementierung (kurzfristig — Relay-only)
1. DM kommt beim Server an (via Socket.IO `dm:send`)
2. Server leitet sofort weiter an den Empfänger (`user:{receiverId}`)
3. Server schreibt **nicht** in die Datenbank
4. Wenn Empfänger offline: Nachricht geht verloren (kein Persistieren)

#### Implementierung (mittelfristig — E2E Encrypted)
1. Beim ersten Kontakt tauschen Sender und Empfänger Public Keys aus (X25519)
2. Sender verschlüsselt Nachricht mit dem Public Key des Empfängers (libsodium / TweetNaCl)
3. Server sieht nur den verschlüsselten Blob — kann nichts lesen
4. Optional: Server speichert verschlüsselte Blobs für Offline-Delivery
   — selbst wenn der Server gehackt wird, sind die Nachrichten unlesbar

#### Implementierung (langfristig — Signal Protocol)
- Vollständiges Forward Secrecy (Nachrichten können auch mit dem Private Key
  nicht nachträglich entschlüsselt werden)
- Libraries: `@signalapp/libsignal-client` (Node.js + Browser)

---

## Server-Typen beim Erstellen

Wenn ein Nutzer einen Server erstellt, wählt er:

```
[ NoVoice Server ] ←── Auf NoVoice-Infrastruktur (Hetzner)
[ Eigener Server  ] ←── User gibt seine eigene Server-URL ein
```

### NoVoice Server
- Läuft auf deiner Hetzner-Infrastruktur
- Nutzer zahlen optional für mehr Features (→ Monetisierung)
- Nachrichten-History wird gespeichert (transparent kommuniziert)

### Eigener Server
- Nutzer gibt `https://mein-server.example.com` ein
- App verbindet sich mit dieser URL statt mit `api.novoice.app`
- Auth-Token bleibt kompatibel (gleiche JWT-Struktur)
- Server-Owner hostet selbst (Hetzner, VPS, Raspberry Pi)

---

## Hetzner / Coolify Setup

### Infrastruktur
```
Hetzner Root Server
└── Coolify (Container-Management)
    ├── novoice-api       ← Node.js Server (Port 3001)
    ├── novoice-db        ← PostgreSQL (ersetzt sql.js für Production)
    └── novoice-nginx     ← Reverse Proxy + SSL
```

### Datenbank-Migration (sql.js → PostgreSQL)
Für Production sollte sql.js durch PostgreSQL ersetzt werden:
- sql.js ist eine In-Memory SQLite — nicht skalierbar für viele Nutzer
- PostgreSQL bietet echte Persistenz, Backups, Replication
- Migration: Alle `?` Placeholder durch `$1, $2, ...` ersetzen (pg-Syntax)
- Library: `pg` (node-postgres)

### Environment Variables (Production)
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/novoice
JWT_SECRET=<64-byte-random-secret>
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://novoice.app
```

---

## Monetisierung

### Free Tier
- Bis zu 3 Server
- Bis zu 50 Mitglieder pro Server
- 30 Tage Nachrichten-History
- DMs: Relay-only (kein Offline-Delivery)

### NoVoice Pro (z.B. 3€/Monat)
- Unbegrenzte Server
- Bis zu 500 Mitglieder pro Server
- Unbegrenzte History
- DMs mit Offline-Delivery (verschlüsselt gespeichert)
- Custom Server-Domain

### NoVoice Team (z.B. 8€/Monat pro Server)
- Bis zu 10.000 Mitglieder
- Voice-Channel Recording (optional, mit Zustimmung)
- Admin-Tools & Moderations-Features
- Priority Support

### Self-Hosting (kostenlos, Open Source)
- Volle Features, selbst gehosted
- Community-Support via GitHub Issues
- Keine Datenspeicherung bei uns

---

## Open Source Strategie

### Lizenz: AGPL-3.0
- Code ist frei nutzbar und veränderbar
- Wer NoVoice hosted und Änderungen macht, muss die Änderungen
  ebenfalls Open Source machen (Copyleft)
- Schützt davor, dass jemand NoVoice nimmt, verbessert, und als
  proprietären Service anbietet ohne zurückzugeben

### Repo-Struktur (Empfehlung)
```
novoice/
├── apps/
│   ├── desktop/        ← Electron App (dieses Projekt)
│   └── server/         ← Backend Server
├── packages/
│   ├── protocol/       ← Shared types & API contracts
│   └── crypto/         ← E2E Encryption utilities
├── docs/
│   ├── self-hosting.md ← Anleitung für Self-Hosting
│   └── api.md          ← API Dokumentation
└── docker-compose.yml  ← Einfaches Self-Hosting Setup
```

### Docker Compose für Self-Hosting
```yaml
version: '3.8'
services:
  api:
    image: novoice/server:latest
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://nv:nv@db:5432/novoice
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - db
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: novoice
      POSTGRES_USER: nv
      POSTGRES_PASSWORD: nv
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

---

## Nächste Schritte (Priorität)

1. **Kurzfristig**
   - [ ] DMs nicht in DB speichern (nur relay via Socket.IO)
   - [ ] "Server-Typ" Auswahl beim Erstellen (NoVoice / Eigener)
   - [ ] PostgreSQL Migration vorbereiten

2. **Mittelfristig**
   - [ ] E2E Encryption für DMs (TweetNaCl)
   - [ ] Docker Compose für Self-Hosting
   - [ ] Download-Page (Electron Builder → .exe, .dmg, .AppImage)
   - [ ] Coolify Deployment auf Hetzner

3. **Langfristig**
   - [ ] Signal Protocol für DMs
   - [ ] Mobile App (React Native)
   - [ ] Server Federation (verschiedene Server können kommunizieren)
   - [ ] Monetisierung via Stripe
