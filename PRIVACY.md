# Datenschutzerklärung – InvoiceAtlas

*Stand: 5. August 2026*

## Kurzfassung

InvoiceAtlas erhebt, speichert und überträgt **keine Daten**. Die Extension hat
keinen Server, kein Analytics, kein Tracking und keine Konten. Alles passiert
lokal in deinem Browser.

## Was die Extension tut

InvoiceAtlas lädt auf deinen Klick hin die Rechnungs-PDFs deiner eigenen
amazon.de-Bestellungen und bindet sie lokal zu einer PDF-Datei zusammen. Dafür
ruft die Extension – mit deiner bestehenden Amazon-Sitzung – folgende Seiten ab:

- deine Bestellübersicht auf `amazon.de` (um Bestellungen und Rechnungslinks zu finden)
- die Rechnungs-PDFs, die Amazon dort verlinkt (teilweise ausgeliefert über
  `s3.amazonaws.com` bzw. `media-amazon.com`, Amazons eigene Auslieferungs-Server)

Diese Abrufe sind dieselben, die dein Browser ausführen würde, wenn du die
Rechnungen von Hand herunterlädst.

## Was mit den Daten passiert

- Die abgerufenen Seiten und PDFs werden **nur im Arbeitsspeicher** deines
  Browsers verarbeitet.
- Das Ergebnis (die gebündelte PDF) wird als Download auf **deinem Rechner**
  gespeichert. Wohin, entscheidest du.
- Es werden **keine Daten an den Entwickler oder an Dritte** übertragen.
  Die Extension kommuniziert ausschließlich mit Amazon – und auch das nur,
  wenn du aktiv auf „Rechnungen sammeln" klickst.
- Es werden keine Daten dauerhaft in der Extension gespeichert (kein
  `storage`, keine Cookies, keine Profile).

## Berechtigungen

Die Extension fordert ausschließlich Host-Berechtigungen für `amazon.de`,
`s3.amazonaws.com` und `media-amazon.com` an. Sie dienen allein dem Abruf
deiner Bestellhistorie und Rechnungs-PDFs. Es gibt keine weiteren
Berechtigungen – kein Zugriff auf Browserverlauf, Lesezeichen, andere
Websites oder Tabs.

## Kontakt

Fragen zum Datenschutz: [GitHub-Repository](https://github.com/killerpony789/invoice-atlas)
– bitte ein Issue eröffnen.
