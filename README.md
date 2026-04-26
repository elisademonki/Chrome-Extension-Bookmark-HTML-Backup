# Bookmark HTML Backup v1.2.0

Chrome-Erweiterung zum Exportieren der Lesezeichen als HTML-Datei.

## Funktionen

- Einfacher Klick auf das Extension-Icon: Backup im gespeicherten Standardmodus.
- Doppelklick auf das Extension-Icon: Optionen öffnen.
- Rechtsklick auf das Extension-Icon: direkt auswählen:
  - Backup kompakt ohne Favicons
  - Backup voll mit Favicons
  - Optionen öffnen
- Backup-Dateiname enthält Datum, Uhrzeit und Modus.
- Ausgabeordner bleibt gespeichert.

## Wichtig

Chrome erlaubt einer normalen Extension beim Download nur einen Zielpfad relativ zum Chrome-Downloadordner.

Beispiel:

```text
bookmark-backups
```

speichert nach:

```text
Downloads\bookmark-backups\Chrome_Bookmarks_...
```

Für einen echten Zielordner außerhalb von Downloads kann unter Windows eine Junction genutzt werden, z. B.:

```bat
mklink /J "%USERPROFILE%\Downloads\backup_bookmarks" "C:\FESTPLATTEN\BA_OBSIDIAN_0\backup_bookmarks"
```

Dann in den Optionen `backup_bookmarks` eintragen.

## Modi

- **Kompakt ohne Favicons:** kleinere Datei, schneller, enthält Ordner/Titel/URLs/Zeiten.
- **Voll mit Favicons:** größere Datei, ähnlicher zum Chrome-Manager-Export.
