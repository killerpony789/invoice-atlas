# InvoiceAtlas

**Amazon-Rechnungen gesammelt herunterladen – und zu einer PDF gebündelt.**

InvoiceAtlas lädt alle Rechnungs-PDFs eines Jahres aus deiner amazon.de-Bestellhistorie
und bindet sie chronologisch zu **einer** PDF mit Deckblatt und Inhaltsverzeichnis
(Datum, Bestellnummer, Artikel, Betrag, Seitenzahl). Jede Verzeichniszeile ist
klickbar und springt direkt zur jeweiligen Rechnung. Optional werden zusätzlich die
Einzel-PDFs im GoBD-Namensschema (`JJJJ-MM-TT_Bestellnr_Betrag.pdf`) gespeichert.

Alles läuft **komplett lokal** im Browser: keine Server, kein Tracking, kein Abo.

**[➜ InvoiceAtlas im Chrome Web Store installieren](https://chromewebstore.google.com/detail/invoiceatlas/mgclafmbmepipoknlblhchfhbafnhneo)**

## Installation

Am einfachsten über den
[Chrome Web Store](https://chromewebstore.google.com/detail/invoiceatlas/mgclafmbmepipoknlblhchfhbafnhneo) –
ein Klick auf **„Hinzufügen"**, fertig.

Alternativ als entpackte Extension (z. B. zum Entwickeln):

1. Chrome öffnen → `chrome://extensions`
2. Oben rechts **Entwicklermodus** aktivieren
3. **„Entpackte Erweiterung laden"** → diesen Ordner (`invoice-atlas`) auswählen
4. Optional: Extension über das Puzzle-Symbol in der Toolbar anpinnen

## Nutzung

1. In diesem Chrome-Profil bei [amazon.de](https://www.amazon.de) einloggen
2. Auf das InvoiceAtlas-Icon klicken → es öffnet sich ein Tab
3. Jahr auswählen → **„Rechnungen sammeln"**
4. Am Ende: **„InvoiceAtlas_JJJJ.pdf herunterladen"**

Zwischen allen Anfragen wartet die Extension 400 ms, um Amazons Bot-Erkennung
nicht zu provozieren. Ein Jahr mit ~50 Bestellungen dauert damit etwa 1–2 Minuten.

## Gut zu wissen

Eine Bestellung kann **mehrere echte Rechnungen** haben: Amazon stellt pro
Verkäufer einen eigenen Beleg aus, dazu kommen ggf. Rechnungskorrekturen.
InvoiceAtlas nimmt sie alle mit; im Inhaltsverzeichnis stehen Folgedokumente
als eigene Zeile („» Rechnung 2", „» Rechnungskorrektur 1"). Der Betrag in
der Übersicht ist immer die **Bestellsumme**, nicht der Betrag des einzelnen
Belegs. Byte-identische Duplikate (gleicher Link, doppelt verlinkt) werden
per SHA-256-Vergleich automatisch übersprungen.

## Grenzen (v0.1)

- Nur **amazon.de** (weitere Domains sind vorbereitet, aber ungetestet)
- Bestellungen ohne hinterlegte PDF (manche Marketplace-Händler, digitale Käufe)
  werden übersprungen und im Inhaltsverzeichnis + Ergebnis-Report aufgelistet
- Ändert Amazon sein HTML, müssen ggf. die Parsing-Anker in `app.js` angepasst
  werden (`parseOrderPage`, `parseInvoiceLinks`)

## Technik

- Manifest V3, keine Berechtigungen außer `host_permissions` für `www.amazon.de`
- Bestellhistorie wird mit `disableCsd=no-js` geladen (Server-HTML, stabil parsebar)
- PDF-Merge lokal via [pdf-lib](https://pdf-lib.js.org/) (gebündelt in `vendor/`)
- Eigenständige Implementierung; Funktionsprinzip inspiriert von InvoiceGrab,
  es wurde kein fremder Code übernommen

## Datenschutz

Siehe [PRIVACY.md](PRIVACY.md) – Kurzfassung: keine Server, keine Datenerhebung,
alles bleibt lokal im Browser.

## Lizenz

[MIT](LICENSE). InvoiceAtlas ist ein unabhängiges Projekt und steht in keiner
Verbindung zu Amazon; „Amazon" ist eine Marke der Amazon Technologies, Inc. und
wird hier nur beschreibend verwendet.
