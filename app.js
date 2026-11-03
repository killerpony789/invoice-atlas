/* InvoiceAtlas – sammelt Amazon-Rechnungs-PDFs eines Jahres und bindet sie
 * chronologisch zu einer PDF mit Inhaltsverzeichnis. Läuft komplett lokal. */
/* global PDFLib */

const BASE = 'https://www.amazon.de';
const DELAY_MS = 400; // Pause zwischen Requests, um Amazon nicht zu reizen
const A4 = [595.28, 841.89];

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = { running: false, cancelled: false };

// ---------------------------------------------------------------------------
// Parsen der Bestellhistorie (Server-HTML via disableCsd=no-js)
// ---------------------------------------------------------------------------

const MONTHS = {
  januar: '01', februar: '02', 'märz': '03', april: '04', mai: '05', juni: '06',
  juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
};
const RE_ORDER_ID = /\b((?:[A-Z]\d{2}|\d{3})-\d{7}-\d{7})\b/;
const RE_DATE = /(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i;
const RE_AMOUNT = /(?:EUR\s*)?(\d{1,3}(?:\.\d{3})*),(\d{2})(?:\s*€)?/;
const RE_POPOVER = /(?:href="|"url"\s*:\s*")([^"]*(?:invoice\.html|invoice\/popover)\?[^"]*)"/;
const RE_ANCHOR_TAGS = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/g, '&');
}

function absolutize(url) {
  return url.startsWith('http') ? url : BASE + url;
}

function parseGermanDate(text) {
  const m = RE_DATE.exec(text);
  if (!m) return null;
  return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`; // ISO, sortierbar
}

function parseAmountCents(text) {
  if (!/€|EUR/.test(text)) return null;
  const m = RE_AMOUNT.exec(text);
  return m ? Number(m[1].replace(/\./g, '')) * 100 + Number(m[2]) : null;
}

/** Zerlegt eine Bestellhistorien-Seite in ihre Bestellungen. */
function parseOrderPage(html) {
  const orders = [];
  const cards = html.split(/class="[^"]*\border-card\b/).slice(1);
  for (const raw of cards) {
    const card = decodeEntities(raw);
    const idMatch = RE_ORDER_ID.exec(card);
    if (!idMatch) continue;
    const dateAnchor = /BESTELLUNG AUFGEGEBEN|ABONNEMENT ABGERECHNET/i.exec(card);
    const date = parseGermanDate(card.slice(dateAnchor ? dateAnchor.index : 0));
    const sumAnchor = /SUMME/i.exec(card);
    const totalCents = parseAmountCents(card.slice(sumAnchor ? sumAnchor.index : 0));
    const popover = RE_POPOVER.exec(card);
    orders.push({
      orderId: idMatch[1],
      date,
      totalCents,
      titles: extractTitles(card),
      invoiceUrl: popover ? absolutize(popover[1]) : null,
      // „storniert" (nicht „stornieren"-Button) UND keine Summe: voll storniert,
      // nie berechnet – Teilstornierungen behalten ihre Summe und laufen normal.
      cancelled: totalCents === null && /\bstorniert\b/i.test(card),
    });
  }
  return orders;
}

const RE_ASIN = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/;

/** Artikelnamen aus einer Bestellkarte: pro Artikel (ASIN) der längste Linktext –
 * der Produkttitel ist immer länger als Button-Texte wie „Deinen Artikel anzeigen". */
function extractTitles(card) {
  const byAsin = new Map();
  for (const m of card.matchAll(RE_ANCHOR_TAGS)) {
    const asin = RE_ASIN.exec(m[1]);
    if (!asin) continue;
    const text = m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const prev = byAsin.get(asin[1]);
    if (!prev || text.length > prev.length) byAsin.set(asin[1], text);
  }
  return [...byAsin.values()];
}

/** Extrahiert PDF-Links aus dem Rechnungs-Popover einer Bestellung. */
function parseInvoiceLinks(html) {
  const links = [];
  for (const m of decodeEntities(html).matchAll(RE_ANCHOR_TAGS)) {
    const url = m[1];
    if (!(/\.pdf(?:[?#]|$)/i.test(url) || url.includes('/documents/download/'))) continue;
    const label = m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    links.push({ url: absolutize(url), label });
  }
  return links;
}

// ---------------------------------------------------------------------------
// Netzwerk
// ---------------------------------------------------------------------------

async function fetchText(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (res.url.includes('/ap/signin')) throw new Error('NOT_LOGGED_IN');
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  return res.text();
}

async function fetchPdf(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (res.url.includes('/ap/signin')) throw new Error('NOT_LOGGED_IN');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const head = String.fromCharCode(...buf.slice(0, 5));
  if (!head.startsWith('%PDF')) throw new Error('Antwort ist keine PDF-Datei');
  return buf;
}

/** Query-Parameter (ref-Codes, ablaufende Signaturen) ändern sich,
 * das Dokument dahinter nicht – für Duplikat-Erkennung nur Origin+Pfad. */
function canonicalUrlKey(url) {
  const u = new URL(url);
  return u.origin + u.pathname;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// UI-Helfer
// ---------------------------------------------------------------------------

function log(msg, cls = '') {
  const div = document.createElement('div');
  if (cls) div.className = cls;
  div.textContent = msg;
  $('#log').appendChild(div);
  $('#log').scrollTop = $('#log').scrollHeight;
}

function setStatus(msg) { $('#status').textContent = msg; }
function setProgress(done, total) {
  $('#bar').style.width = total ? `${Math.round((done / total) * 100)}%` : '0';
}

function fmtDate(iso) {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function fmtEuro(cents) {
  if (cents == null) return '–';
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}

function euroForFilename(cents) {
  return cents == null ? 'NA' : (cents / 100).toFixed(2).replace('.', ',') + 'EUR';
}

/** Helvetica (Standard-Font) kann nur WinAnsi – Emoji, ™ & Co. rauswerfen. */
function winAnsiSafe(s) {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u20AC]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fitText(text, font, size, maxWidth) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxWidth) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

// ---------------------------------------------------------------------------
// Sammellauf
// ---------------------------------------------------------------------------

/** Blättert per startIndex weiter, bis eine Seite keine NEUEN Bestellungen
 * mehr liefert – bewusst ohne den „Weiter"-Link zu parsen, dessen Markup
 * Amazon ändern kann (hat es zwischen 08/2026 und 11/2026 getan: Ergebnis
 * war Abbruch nach Seite 1 = 10 Bestellungen). */
async function collectOrders(year) {
  const all = new Map();
  let startIndex = 0;
  let pageSize = null;
  for (let page = 1; page <= 200; page++) {
    if (state.cancelled) throw new Error('CANCELLED');
    setStatus(`Durchsuche Bestellungen – Seite ${page} …`);
    const url = `${BASE}/your-orders/orders?timeFilter=year-${year}&startIndex=${startIndex}&disableCsd=no-js`;
    const orders = parseOrderPage(await fetchText(url));
    const before = all.size;
    for (const o of orders) if (!all.has(o.orderId)) all.set(o.orderId, o);
    const added = all.size - before;
    log(`Seite ${page}: ${orders.length} Bestellungen${added < orders.length ? ` (${added} neu)` : ''}`);
    if (added === 0) break; // leere Seite oder nur Wiederholungen: Ende erreicht
    pageSize = pageSize ?? orders.length;
    startIndex += pageSize;
    await sleep(DELAY_MS);
  }
  return [...all.values()];
}

async function run() {
  if (state.running) return;
  state.running = true;
  state.cancelled = false;
  $('#run').disabled = true;
  $('#cancel').hidden = false;
  $('#result').hidden = true;
  $('#progress').hidden = false;
  $('#log').innerHTML = '';
  setProgress(0, 1);

  const year = $('#year').value;

  try {
    const orders = await collectOrders(year);
    if (orders.length === 0) {
      log(`Keine Bestellungen für ${year} gefunden.`, 'warn');
      setStatus('Fertig – nichts gefunden.');
      return;
    }
    log(`${orders.length} Bestellungen in ${year} gefunden.`, 'ok');
    orders.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));

    const items = [];   // { order, buf, n }
    const skipped = []; // { order, reason }
    const seenUrls = new Set();   // kanonische URLs (ohne Query)
    const seenHashes = new Set(); // SHA-256 der PDF-Inhalte

    for (let i = 0; i < orders.length; i++) {
      if (state.cancelled) throw new Error('CANCELLED');
      const order = orders[i];
      setStatus(`Lade Rechnungen: Bestellung ${i + 1} von ${orders.length}`);
      setProgress(i, orders.length);

      if (order.cancelled) {
        skipped.push({ order, reason: 'Bestellung storniert – nicht berechnet, daher keine Rechnung' });
        continue;
      }
      // Bestellkarte ohne Rechnungslink heißt nicht zwingend „keine Rechnung":
      // dann das Rechnungs-Popover der Bestelldetails direkt ansteuern.
      const invoiceUrl = order.invoiceUrl
        ?? `${BASE}/your-orders/invoice/popover?orderId=${encodeURIComponent(order.orderId)}`;
      let links, popoverHtml;
      try {
        popoverHtml = await fetchText(invoiceUrl);
        links = parseInvoiceLinks(popoverHtml);
      } catch (e) {
        if (e.message === 'NOT_LOGGED_IN' || e.message === 'CANCELLED') throw e;
        skipped.push({ order, reason: `Rechnungs-Popover nicht ladbar (${e.message})` });
        continue;
      }
      await sleep(DELAY_MS);
      if (links.length === 0) {
        // Grund nur behaupten, wenn er auch im Popover steht – und ganz frische
        // Bestellungen gesondert ausweisen (Rechnung existiert oft noch nicht).
        const canRequest = /Rechnung anfordern|request-invoice/i.test(popoverHtml);
        const ageDays = order.date ? (Date.now() - new Date(order.date).getTime()) / 86400000 : Infinity;
        const reason = ageDays <= 3
          ? 'Rechnung liegt noch nicht vor (Bestellung ist neu) – in 1–2 Tagen erneut laden'
          : canRequest
            ? 'keine PDF-Rechnung vorhanden – Amazon bietet nur „Rechnung anfordern" an'
            : 'keine PDF-Rechnung im Rechnungs-Popover gefunden';
        skipped.push({ order, reason });
        continue;
      }
      let got = 0;
      let dups = 0;
      let lastErr = null;
      for (const link of links) {
        if (state.cancelled) throw new Error('CANCELLED');
        const key = canonicalUrlKey(link.url);
        if (seenUrls.has(key)) { dups++; continue; } // gleiches Dokument, nur anders verlinkt
        try {
          const buf = await fetchPdf(link.url);
          seenUrls.add(key);
          const hash = await sha256Hex(buf);
          if (seenHashes.has(hash)) {
            dups++;
            log(`· ${order.orderId}: „${link.label || 'Rechnung'}“ ist inhaltsgleich – übersprungen`);
          } else {
            seenHashes.add(hash);
            items.push({ order, buf, label: link.label, n: ++got });
          }
        } catch (e) {
          if (e.message === 'NOT_LOGGED_IN' || e.message === 'CANCELLED') throw e;
          lastErr = e.message === 'Failed to fetch'
            ? `Zugriff blockiert (${new URL(link.url).hostname} – fehlende Host-Berechtigung?)`
            : e.message;
          log(`⚠ ${order.orderId}: ${link.label || 'PDF'} – ${lastErr}`, 'warn');
        }
        await sleep(DELAY_MS);
      }
      if (got === 0 && dups > 0) log(`✓ ${order.orderId}: Rechnung bereits enthalten (Duplikat)`, 'ok');
      else if (got === 0) skipped.push({ order, reason: `PDF-Download fehlgeschlagen (${lastErr ?? 'unbekannt'})` });
      else log(`✓ ${order.orderId} (${fmtDate(order.date)}): ${got} PDF${got > 1 ? 's' : ''}${dups ? ` (+${dups} Duplikat übersprungen)` : ''}`, 'ok');
    }
    setProgress(1, 1);

    if (items.length === 0) {
      log('Keine einzige PDF-Rechnung gefunden.', 'warn');
      setStatus('Fertig – keine PDFs.');
      showResult(null, { year, items: 0, orders: orders.length, skipped, pageCount: 0 });
      return;
    }

    setStatus('Baue Gesamt-PDF …');
    const atlas = await buildAtlas(items, { year, skipped });
    showResult(atlas.blob, {
      year,
      items: atlas.included,
      orders: orders.length,
      skipped,
      pageCount: atlas.pageCount,
    });
    if ($('#singles').checked) await saveSingles(items);
    setStatus('Fertig.');
  } catch (e) {
    if (e.message === 'CANCELLED') {
      setStatus('Abgebrochen.');
      log('Abgebrochen.', 'warn');
    } else if (e.message === 'NOT_LOGGED_IN') {
      setStatus('Nicht eingeloggt.');
      log(`Du bist bei ${BASE} nicht eingeloggt. Bitte in einem anderen Tab einloggen und erneut starten.`, 'err');
    } else {
      setStatus('Fehler – siehe Log.');
      log(`Fehler: ${e.message}`, 'err');
    }
  } finally {
    state.running = false;
    $('#run').disabled = false;
    $('#cancel').hidden = true;
  }
}

// ---------------------------------------------------------------------------
// PDF-Merge mit Inhaltsverzeichnis
// ---------------------------------------------------------------------------

async function buildAtlas(items, meta) {
  const { PDFDocument, StandardFonts, rgb, PDFName } = PDFLib;
  const out = await PDFDocument.create();
  out.setTitle(`InvoiceAtlas – Amazon-Rechnungen ${meta.year}`);
  out.setProducer('InvoiceAtlas');
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);

  const sources = [];
  for (const it of items) {
    try {
      const src = await PDFDocument.load(it.buf, { ignoreEncryption: true });
      sources.push({ ...it, src, pages: src.getPageCount() });
    } catch {
      log(`⚠ PDF von ${it.order.orderId} unlesbar – übersprungen`, 'warn');
    }
  }

  // Kapazitäten müssen exakt zur Zeichenlogik unten passen, damit die
  // Seitenzahlen im Verzeichnis stimmen.
  const FIRST_LINES = 34, NEXT_LINES = 44, LH = 16;
  const extraLines = meta.skipped.length ? meta.skipped.length + 2 : 0;
  const totalLines = sources.length + extraLines;
  const tocPages = totalLines <= FIRST_LINES
    ? 1
    : 1 + Math.ceil((totalLines - FIRST_LINES) / NEXT_LINES);

  let pageNo = tocPages + 1;
  for (const s of sources) { s.startPage = pageNo; pageNo += s.pages; }
  const totalPages = pageNo - 1;

  const blue = rgb(0.04, 0.37, 0.84);
  const gray = rgb(0.45, 0.45, 0.45);
  const black = rgb(0.1, 0.1, 0.1);

  let page = out.addPage(A4);
  page.drawText('InvoiceAtlas', { x: 50, y: 770, size: 28, font: bold, color: blue });
  page.drawText(`Amazon-Rechnungen ${meta.year} (amazon.de)`, { x: 50, y: 745, size: 13, font, color: black });
  page.drawText(`${sources.length} Rechnungen · ${totalPages} Seiten`, { x: 50, y: 727, size: 11, font, color: gray });
  page.drawText('Inhalt', { x: 50, y: 690, size: 14, font: bold, color: black });

  let y = 668;
  let linesLeft = FIRST_LINES;
  const newTocPage = () => { page = out.addPage(A4); y = 790; linesLeft = NEXT_LINES; };
  const ensureLine = () => { if (linesLeft <= 0) newTocPage(); };
  const advance = () => { y -= LH; linesLeft--; };
  const rightAlign = (text, size, xRight) =>
    page.drawText(text, { x: xRight - font.widthOfTextAtSize(text, size), y, size, font, color: black });

  const tocLinks = []; // Klickflächen im Verzeichnis; Ziel-Refs gibt es erst nach dem Kopieren
  for (const s of sources) {
    ensureLine();
    page.drawText(fmtDate(s.order.date), { x: 50, y, size: 9, font, color: black });
    page.drawText(s.order.orderId + (s.n > 1 ? ` (${s.n})` : ''), { x: 126, y, size: 9, font, color: blue });
    // Ab dem zweiten Dokument einer Bestellung (eigene Rechnung je Verkäufer,
    // Rechnungskorrekturen) das Popover-Label zeigen statt Titel + Bestellsumme
    // zu wiederholen – sonst sehen die Zeilen wie Duplikate aus.
    const cell = s.n > 1
      ? `» ${winAnsiSafe(s.label || 'weiteres Dokument')}`
      : winAnsiSafe((s.order.titles ?? []).join(', '));
    if (cell) page.drawText(fitText(cell, font, 9, 175), { x: 235, y, size: 9, font, color: gray });
    if (s.n === 1) rightAlign(fmtEuro(s.order.totalCents), 9, 468);
    rightAlign(`S. ${s.startPage}`, 9, 545);
    tocLinks.push({ page, rect: [50, y - 3, 545, y + 10], source: s });
    advance();
  }
  if (meta.skipped.length) {
    ensureLine(); advance(); // Leerzeile
    ensureLine();
    page.drawText('Ohne PDF-Rechnung (bei Amazon nicht abrufbar):', { x: 50, y, size: 10, font: bold, color: gray });
    advance();
    for (const sk of meta.skipped) {
      ensureLine();
      const skTitle = winAnsiSafe((sk.order.titles ?? []).join(', '));
      const line = `${fmtDate(sk.order.date)}   ${sk.order.orderId}   ` +
        (skTitle ? `${skTitle} - ` : '') + winAnsiSafe(sk.reason);
      page.drawText(fitText(line, font, 9, 495), { x: 50, y, size: 9, font, color: gray });
      advance();
    }
  }

  for (const s of sources) {
    const copied = await out.copyPages(s.src, s.src.getPageIndices());
    s.targetRef = copied[0].ref;
    for (const p of copied) out.addPage(p);
  }

  // Verzeichniszeilen mit ihren Rechnungen verlinken (Link-Annotationen)
  for (const l of tocLinks) {
    const annotRef = out.context.register(out.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: l.rect,
      Border: [0, 0, 0],
      Dest: [l.source.targetRef, 'Fit'],
    }));
    const annots = l.page.node.lookup(PDFName.of('Annots'));
    if (annots) annots.push(annotRef);
    else l.page.node.set(PDFName.of('Annots'), out.context.obj([annotRef]));
  }

  // Ohne Object Streams speichern: minimal größer, aber jeder noch so alte
  // oder naive PDF-Parser kommt damit klar (klassische xref-Tabelle).
  const bytes = await out.save({ useObjectStreams: false });
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    pageCount: totalPages,
    included: sources.length,
  };
}

// ---------------------------------------------------------------------------
// Ergebnis & Downloads
// ---------------------------------------------------------------------------

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function saveSingles(items) {
  setStatus('Speichere Einzel-PDFs …');
  for (const it of items) {
    const name = `${it.order.date ?? '0000-00-00'}_${it.order.orderId}` +
      (it.n > 1 ? `_${it.n}` : '') + `_${euroForFilename(it.order.totalCents)}.pdf`;
    triggerDownload(new Blob([it.buf], { type: 'application/pdf' }), name);
    await sleep(300);
  }
}

function showResult(blob, r) {
  $('#result').hidden = false;
  $('#result-title').textContent = blob
    ? `Fertig: dein Rechnungs-Atlas ${r.year}`
    : `Keine PDFs für ${r.year}`;
  $('#result-stats').textContent =
    `${r.items} Rechnungen aus ${r.orders} Bestellungen · ${r.pageCount} Seiten` +
    (r.skipped.length ? ` · ${r.skipped.length} Bestellung(en) ohne abrufbare Rechnung` : '');
  const btn = $('#download');
  btn.hidden = !blob;
  if (blob) {
    btn.textContent = `InvoiceAtlas_${r.year}.pdf herunterladen`;
    btn.onclick = () => triggerDownload(blob, `InvoiceAtlas_amazon.de_${r.year}.pdf`);
  }
  const box = $('#skipped-box');
  box.hidden = r.skipped.length === 0;
  if (r.skipped.length) {
    box.querySelector('summary').textContent =
      `${r.skipped.length} Bestellung(en) ohne abrufbare Rechnung anzeigen`;
    $('#skipped-list').innerHTML = '';
    for (const sk of r.skipped) {
      const li = document.createElement('li');
      const t = (sk.order.titles ?? []).join(', ');
      li.textContent = `${fmtDate(sk.order.date)} – ${sk.order.orderId}${t ? ` – ${t}` : ''} – ${sk.reason}`;
      $('#skipped-list').appendChild(li);
    }
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function init() {
  const now = new Date().getFullYear();
  for (let y = now; y >= 2010; y--) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = `Jahr ${y}`;
    $('#year').appendChild(opt);
  }
  $('#run').addEventListener('click', run);
  $('#cancel').addEventListener('click', () => { state.cancelled = true; });
}

init();
