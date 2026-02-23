# Auto Updates (Electron + React)

## Was jetzt bereits eingebaut ist
- Hintergrund-Updatecheck alle 6 Stunden in der Electron-App
- Menüpunkt im Tray: `Check for Updates`
- Automatischer Download bei verfügbarem Update
- Dialog `Restart now` nach Download
- IPC-API in `preload` für spätere UI-Anzeige:
  - `window.electronAPI.updater.check()`
  - `window.electronAPI.updater.getStatus()`
  - `window.electronAPI.updater.onStatus(cb)`
  - `window.electronAPI.updater.restartAndInstall()`

## Wichtig
- Auto-Update funktioniert für den installierten `NSIS` Build.
- `portable` Builds bekommen keine echten Auto-Updates.

## Release-Flow (GitHub Releases)
1. Version in `package.json` erhöhen (z. B. `1.0.1`).
2. GitHub Token setzen (mit Repo-Rechten):
   - PowerShell: `$env:GH_TOKEN=\"<token>\"`
3. Optional Update-Repo setzen (Default ist `ikwy/NoVoice`):
   - `$env:NOVOICE_UPDATER_OWNER=\"<owner>\"`
   - `$env:NOVOICE_UPDATER_REPO=\"<repo>\"`
4. Publish ausführen:
   - `npm run electron:publish`

Dadurch werden Installer + Update-Metadaten veröffentlicht. Bereits installierte Nutzer bekommen das Update automatisch in der App.
