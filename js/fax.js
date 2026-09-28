// FaxClear's shared models: the Group 3 page grid (ITU-T T.4), the pages you can send, a real
// Modified Huffman coder and decoder, the T.30 handshake and modem specs, a procedural fax-sound
// generator (Web Audio, muted by the sound button and silent while the studio records), the bit-error
// and ECM model, and a generic desktop fax machine in 3D.
//
// Sources for the numbers used here:
//  - ITU-T T.4 (Group 3 facsimile): 1728 picture elements along a 215 mm scan line (about 8.04/mm,
//    "204 dpi"), 3.85 lines/mm standard ("98 dpi") and 7.7 lines/mm fine ("196 dpi"); one-dimensional
//    Modified Huffman coding with terminating codes (0–63) and make-up codes (64–1728); EOL = 000000000001;
//    RTC = six EOLs; minimum transmission time of a coded line (fill bits); Annex A: error correction mode
//    (ECM) with 256-octet frames, up to 256 frames per block, resent on request. itu.int/rec/T-REC-T.4
//  - ITU-T T.30: CNG calling tone 1100 Hz, 0.5 s on / 3 s off; CED answer tone 2100 Hz for 2.6–4.0 s;
//    control messages (DIS, DCS, CFR, MCF, EOP, DCN) as HDLC frames sent with V.21 channel 2 FSK at
//    300 bit/s (1650 Hz = 1, 1850 Hz = 0) after about 1 s of flag preamble; TCF training check 1.5 s.
//  - ITU-T V.27 ter: 4800 bit/s, 1600 baud, 8-phase PSK, 1800 Hz carrier. V.29: 9600 bit/s, 2400 baud,
//    16-point QAM, 1700 Hz carrier. V.17: 14,400 bit/s, 2400 baud, trellis-coded 128-point QAM
//    (6 data bits + 1 trellis bit per symbol), 1800 Hz carrier.
//  - Wikipedia, "Fax": 204×98 normal and 204×196 fine; 1728 pixels × 1145 lines raw for A4; MH averages
//    a compression factor of about 20 on typical pages; about 10 s per page at 9600 bit/s.
import { THREE, M, box, rod, clamp, canvasTexture } from './kit.js';
import { audio } from './ui.js';

// ---------------------------------------------------------------- the page grid
export const PELS = 1728;                 // picture elements per line (T.4)
export const LINE_MM = 215;               // scanned width
export const A4_MM = [210, 297];
export const RES = {
  std: { name: 'Standard', lpmm: 3.85, dpi: '204 × 98', step: 2 },
  fine: { name: 'Fine', lpmm: 7.7, dpi: '204 × 196', step: 1 },
};
export const FINE_LINES = Math.round(297 * 7.7);          // 2287
export const linesFor = (res) => Math.ceil(FINE_LINES / RES[res].step);   // 1144 / 2287
export const EOL_BITS = 12, RTC_BITS = 72;

// ---------------------------------------------------------------- Modified Huffman code tables (T.4)
const WT = '00110101 000111 0111 1000 1011 1100 1110 1111 10011 10100 00111 01000 001000 000011 110100 110101 101010 101011 0100111 0001100 0001000 0010111 0000011 0000100 0101000 0101011 0010011 0100100 0011000 00000010 00000011 00011010 00011011 00010010 00010011 00010100 00010101 00010110 00010111 00101000 00101001 00101010 00101011 00101100 00101101 00000100 00000101 00001010 00001011 01010010 01010011 01010100 01010101 00100100 00100101 01011000 01011001 01011010 01011011 01001010 01001011 00110010 00110011 00110100'.split(' ');
const WM = '11011 10010 010111 0110111 00110110 00110111 01100100 01100101 01101000 01100111 011001100 011001101 011010010 011010011 011010100 011010101 011010110 011010111 011011000 011011001 011011010 011011011 010011000 010011001 010011010 011000 010011011'.split(' ');
const BT = '0000110111 010 11 10 011 0011 0010 00011 000101 000100 0000100 0000101 0000111 00000100 00000111 000011000 0000010111 0000011000 0000001000 00001100111 00001101000 00001101100 00000110111 00000101000 00000010111 00000011000 000011001010 000011001011 000011001100 000011001101 000001101000 000001101001 000001101010 000001101011 000011010010 000011010011 000011010100 000011010101 000011010110 000011010111 000001101100 000001101101 000011011010 000011011011 000001010100 000001010101 000001010110 000001010111 000001100100 000001100101 000001010010 000001010011 000000100100 000000110111 000000111000 000000100111 000000101000 000001011000 000001011001 000000101011 000000101100 000001011010 000001100110 000001100111'.split(' ');
const BM = '0000001111 000011001000 000011001001 000001011011 000000110011 000000110100 000000110101 0000001101100 0000001101101 0000001001010 0000001001011 0000001001100 0000001001101 0000001110010 0000001110011 0000001110100 0000001110101 0000001110110 0000001110111 0000001010010 0000001010011 0000001010100 0000001010101 0000001011010 0000001011011 0000001100100 0000001100101'.split(' ');
export const EOL = '000000000001';
export const CODES = { WT, WM, BT, BM };
// Codes for one run: a make-up code for the multiple of 64 (if any), then a terminating code.
export function runCodes(len, black) {
  const T = black ? BT : WT, Mk = black ? BM : WM, out = [];
  if (len >= 64) { const m = Math.floor(len / 64); out.push({ n: m * 64, code: Mk[m - 1], makeup: true }); len -= m * 64; }
  out.push({ n: len, code: T[len] });
  return out;
}
const WTL = WT.map((c) => c.length), WML = WM.map((c) => c.length), BTL = BT.map((c) => c.length), BML = BM.map((c) => c.length);
const runLen = (len, black) => (len >= 64 ? (black ? BML : WML)[Math.floor(len / 64) - 1] : 0) + (black ? BTL : WTL)[len % 64];
// Runs of a row (Uint8Array, 1 = black), starting with a white run (which may be 0 long).
export function runsOf(row) {
  const runs = []; let c = 0, n = 0;
  for (let i = 0; i < row.length; i++) { if (row[i] === c) n++; else { runs.push(n); c = row[i]; n = 1; } }
  runs.push(n);
  return runs;
}
export function lineBits(row) { const r = runsOf(row); let b = 0; for (let i = 0; i < r.length; i++) b += runLen(r[i], i & 1); return b; }
export function encodeLine(row) { return runsOf(row).map((n, i) => runCodes(n, i & 1).map((c) => c.code).join('')).join(''); }

// Decoder: a lookup from code string to run length, per colour.
const DEC = [new Map(), new Map()];
WT.forEach((c, i) => DEC[0].set(c, i)); WM.forEach((c, i) => DEC[0].set(c, (i + 1) * 64));
BT.forEach((c, i) => DEC[1].set(c, i)); BM.forEach((c, i) => DEC[1].set(c, (i + 1) * 64));
// Decode one coded line (string of 0/1). Returns { row, ok }. A flipped bit usually turns into a
// different, valid code, so the colours slip sideways until the line ends: the classic fax streak.
export function decodeLine(bits, out = new Uint8Array(PELS)) {
  out.fill(0);
  let x = 0, colour = 0, cur = '', ok = true, total = 0;
  for (let i = 0; i < bits.length; i++) {
    cur += bits[i];
    const v = DEC[colour].get(cur);
    if (v !== undefined) {
      if (colour) out.fill(1, Math.min(PELS, x), Math.min(PELS, x + v));
      x += v; total += v; cur = '';
      if (v < 64) colour ^= 1;
    } else if (cur.length > 13) { ok = false; cur = ''; colour ^= 1; }
  }
  if (total !== PELS || cur) ok = false;
  return { row: out, ok };
}

// ---------------------------------------------------------------- pages
// All drawn here, in millimetres on an A4 sheet. Nothing is copied from anywhere.
export const PAGES = {
  note: { name: 'Handwritten note', short: 'Note' },
  map: { name: 'Hand-drawn map', short: 'Map' },
  form: { name: 'Order form', short: 'Form' },
  photo: { name: 'Photo (halftone)', short: 'Photo' },
  blank: { name: 'Nearly blank page', short: 'Blank' },
  yours: { name: 'Your drawing', short: 'Yours' },
};
export const doodle = { strokes: [], v: 0 };          // your drawing, in mm (kept in memory only)

function hand(g, s, x, y, size = 5, rot = 0) { g.save(); g.translate(x, y); g.rotate(rot); g.font = `italic ${size}px "Instrument Serif", Georgia, serif`; g.fillText(s, 0, 0); g.restore(); }
function type(g, s, x, y, size = 4, bold = false) { g.font = `${bold ? 'bold ' : ''}${size}px Geist, Arial, sans-serif`; g.fillText(s, x, y); }
function line(g, pts, w = 0.6) { g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }

export function paintPage(g, w, h, kind) {
  g.save();
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.scale(w / 210, h / 297);
  g.fillStyle = '#111'; g.strokeStyle = '#111'; g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind === 'note') {
    type(g, 'FAX', 18, 30, 14, true);
    line(g, [[18, 36], [192, 36]], 0.8);
    type(g, 'To:', 18, 48, 5); hand(g, 'Asha, Pune office', 32, 48, 7);
    type(g, 'From:', 18, 60, 5); hand(g, 'Ravi, Chennai', 36, 60, 7);
    type(g, 'Pages:', 120, 48, 5); hand(g, '1 of 1', 140, 48, 7);
    type(g, 'Date:', 120, 60, 5); hand(g, '14 March', 138, 60, 7);
    line(g, [[18, 66], [192, 66]], 0.4);
    const lines = ['Asha, here is the sketch of the new shop front.', 'The sign goes above the door, the window', 'stays wide open to the street. Can you check', 'the size with the carpenter before Friday?', 'Call me if anything is unclear.'];
    lines.forEach((s, i) => hand(g, s, 22, 82 + i * 11, 7.5));
    // a simple sketch of a shop front
    g.lineWidth = 0.9; g.strokeRect(40, 150, 130, 80);
    g.strokeRect(52, 138, 106, 12); type(g, 'CHAI & SNACKS', 66, 147, 7, true);
    g.strokeRect(50, 170, 60, 40); line(g, [[80, 170], [80, 210]]); line(g, [[50, 190], [110, 190]]);
    g.strokeRect(125, 175, 30, 55); g.beginPath(); g.arc(150, 203, 1.4, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 9; i++) line(g, [[40 + i * 16, 150], [48 + i * 16, 158], [56 + i * 16, 150]], 0.6);
    line(g, [[30, 230], [180, 230]], 1.2);
    hand(g, '3.2 m', 97, 240, 6); line(g, [[40, 236], [170, 236]], 0.4);
    hand(g, 'Thanks!  Ravi', 120, 262, 9, -0.05);
    line(g, [[122, 266], [132, 263], [140, 267], [152, 262], [165, 266]], 0.6);
  } else if (kind === 'map') {
    type(g, 'How to reach the workshop', 18, 26, 8, true);
    hand(g, 'from the railway station, about 1.5 km', 18, 38, 6);
    g.lineWidth = 3.2;                                          // main road
    line(g, [[10, 120], [80, 118], [140, 128], [200, 124]], 3.2);
    line(g, [[70, 290], [74, 200], [82, 118], [92, 50]], 3.2);   // cross road
    line(g, [[140, 128], [150, 190], [175, 250]], 1.6);         // lane
    g.setLineDash([2, 2]); line(g, [[20, 60], [40, 70], [30, 90], [55, 100], [45, 115]], 0.8); g.setLineDash([]);
    // river
    g.lineWidth = 0.7; for (const off of [0, 5]) { g.beginPath(); for (let x = 0; x <= 210; x += 2) { const y = 225 + off + 8 * Math.sin(x / 18); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    g.strokeRect(62, 218, 24, 20);                              // bridge
    // landmarks
    g.strokeRect(20, 130, 30, 18); type(g, 'STATION', 22, 142, 4.5, true);
    g.beginPath(); g.arc(112, 88, 9, 0, Math.PI * 2); g.stroke(); type(g, 'TEMPLE', 102, 104, 4);
    g.strokeRect(150, 90, 22, 22); type(g, 'BANK', 153, 104, 4.5);
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(30 + i * 7, 170 + (i % 2) * 5, 3.5, 0, Math.PI * 2); g.stroke(); }
    hand(g, 'park', 32, 188, 5);
    // the star
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 3 : 7.5; g.lineTo(175 + r * Math.cos(a), 250 + r * Math.sin(a)); } g.closePath(); g.fill();
    hand(g, 'Workshop! blue gate', 120, 272, 7);
    line(g, [[18, 110], [30, 104], [45, 108]], 0.5); hand(g, 'turn left at the temple', 96, 76, 5.5);
    g.beginPath(); g.moveTo(186, 30); g.lineTo(190, 18); g.lineTo(194, 30); g.stroke(); type(g, 'N', 188, 38, 5, true);
  } else if (kind === 'form') {
    type(g, 'ORDER FORM', 18, 26, 9, true);
    type(g, 'Sunrise Tiles, Morbi  ·  Fax this back to confirm', 18, 36, 4);
    const cols = [18, 36, 120, 150, 192], rows = 16, y0 = 48, rh = 12;
    g.lineWidth = 0.5;
    for (let r = 0; r <= rows; r++) line(g, [[18, y0 + r * rh], [192, y0 + r * rh]], r < 2 ? 0.9 : 0.4);
    for (const x of cols) line(g, [[x, y0], [x, y0 + rows * rh]], 0.5);
    g.fillRect(18, y0, 174, rh); g.fillStyle = '#fff';
    ['No.', 'Item', 'Qty', 'Price'].forEach((s, i) => type(g, s, cols[i] + 2, y0 + 8.5, 4.5, true));
    g.fillStyle = '#111';
    const items = [['Floor tile 60×60 grey', '120', '42'], ['Wall tile 30×45 white', '200', '28'], ['Skirting 8 cm', '60', '15'], ['Tile spacer (bag)', '10', '90'], ['Grout, ivory 1 kg', '25', '65']];
    items.forEach(([a, q, p], i) => { type(g, String(i + 1), 20, y0 + rh * (i + 2) - 3.5, 4.5); hand(g, a, 38, y0 + rh * (i + 2) - 3, 6); hand(g, q, 124, y0 + rh * (i + 2) - 3, 6); hand(g, p, 155, y0 + rh * (i + 2) - 3, 6); });
    const yb = y0 + rows * rh + 14;
    ['Cash', 'Cheque', 'Bank transfer'].forEach((s, i) => { g.strokeRect(18 + i * 55, yb, 5, 5); type(g, s, 26 + i * 55, yb + 4.5, 4.5); });
    line(g, [[74, yb + 1], [76, yb + 4], [81, yb - 2]], 0.9);
    type(g, 'Signature', 18, yb + 26, 4.5); line(g, [[45, yb + 27], [120, yb + 27]], 0.4);
    line(g, [[50, yb + 25], [60, yb + 18], [66, yb + 26], [72, yb + 19], [85, yb + 24], [100, yb + 21]], 0.7);
  } else if (kind === 'photo') {
    // A grey picture: the rasteriser turns it into a halftone of tiny dots, as a fax does with photos.
    const sky = g.createLinearGradient(0, 20, 0, 200); sky.addColorStop(0, '#6a6a6a'); sky.addColorStop(1, '#e8e8e8');
    g.fillStyle = sky; g.fillRect(15, 20, 180, 180);
    g.fillStyle = '#f7f7f7'; g.beginPath(); g.arc(140, 80, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#555'; g.beginPath(); g.moveTo(15, 170); g.lineTo(60, 110); g.lineTo(95, 150); g.lineTo(130, 105); g.lineTo(195, 165); g.lineTo(195, 200); g.lineTo(15, 200); g.fill();
    g.fillStyle = '#2a2a2a'; g.fillRect(15, 175, 180, 25);
    g.fillStyle = '#111'; type(g, 'Site photo, north side', 15, 214, 6, true);
    hand(g, 'Photos turn into dots, and dots are expensive to send.', 15, 228, 6);
  } else if (kind === 'blank') {
    hand(g, 'Received, thank you.  R.', 20, 30, 8);
  } else if (kind === 'yours') {
    type(g, 'Draw on this page', 18, 22, 5, true);
    g.lineWidth = 1.4;
    for (const st of doodle.strokes) { g.beginPath(); st.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (st.length === 1) g.lineTo(st[0][0] + 0.1, st[0][1]); g.stroke(); }
  }
  g.restore();
}

// Rasterise a page at fine resolution: 1728 × 2287 grey, then threshold (or halftone the photo).
const greyCache = new Map();
function greyOf(kind) {
  const key = kind + (kind === 'yours' ? doodle.v : '');
  if (greyCache.has(key)) return greyCache.get(key);
  if (greyCache.size > 5) greyCache.delete(greyCache.keys().next().value);
  const c = document.createElement('canvas'); c.width = PELS; c.height = FINE_LINES;
  const g = c.getContext('2d', { willReadFrequently: true });
  paintPage(g, PELS, FINE_LINES, kind);
  const d = g.getImageData(0, 0, PELS, FINE_LINES).data, grey = new Uint8Array(PELS * FINE_LINES);
  for (let i = 0; i < grey.length; i++) grey[i] = d[i * 4];
  greyCache.set(key, grey);
  return grey;
}
// One scanned line as the sensor reads it (0 = black, 255 = white), before the black/white decision.
export function greyRow(kind, res, j) { const y = Math.min(FINE_LINES - 1, j * RES[res].step); return greyOf(kind).subarray(y * PELS, (y + 1) * PELS); }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bmCache = new Map();
// The page as fax pixels: { rows: [Uint8Array], lines, bits: Int32Array (MH bits per line) }.
export function bitmap(kind, res = 'std', threshold = 128) {
  const key = `${kind}${kind === 'yours' ? doodle.v : ''}|${res}|${threshold}`;
  if (bmCache.has(key)) return bmCache.get(key);
  if (bmCache.size > 8) bmCache.delete(bmCache.keys().next().value);
  const grey = greyOf(kind), step = RES[res].step, n = linesFor(res), rows = [], bits = new Int32Array(n);
  const halftone = kind === 'photo';
  let total = 0, blackPx = 0;
  for (let j = 0; j < n; j++) {
    const y = Math.min(FINE_LINES - 1, j * step), row = new Uint8Array(PELS), o = y * PELS;
    for (let x = 0; x < PELS; x++) {
      const v = grey[o + x];
      const t = halftone && v > 12 && v < 243 ? ((BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16) * 255 : threshold;
      row[x] = v < t ? 1 : 0; blackPx += row[x];
    }
    rows.push(row); bits[j] = lineBits(row); total += bits[j];
  }
  const out = { rows, lines: n, bits, total, raw: n * PELS, black: blackPx / (n * PELS) };
  bmCache.set(key, out);
  return out;
}
// The pages use the box's own fonts. Load them early, and forget anything rasterised before they arrived.
export const fontsReady = typeof document !== 'undefined' && document.fonts
  ? Promise.all(['italic 20px "Instrument Serif"', '20px Geist', 'bold 20px Geist'].map((f) => document.fonts.load(f).catch(() => {}))).then(() => { greyCache.clear(); bmCache.clear(); })
  : Promise.resolve();
export function forgetYours() { for (const k of [...bmCache.keys()]) if (k.startsWith('yours')) bmCache.delete(k); }

// ---------------------------------------------------------------- modems and timing
export const MODEMS = {
  v27: { name: 'V.27 ter', rate: 4800, baud: 1600, bps: 3, points: 8, carrier: 1800, mod: '8-phase PSK', train: 1.0 },
  v29: { name: 'V.29', rate: 9600, baud: 2400, bps: 4, points: 16, carrier: 1700, mod: '16-point QAM', train: 0.25 },
  v17: { name: 'V.17', rate: 14400, baud: 2400, bps: 6, points: 128, carrier: 1800, mod: 'trellis-coded 128-point QAM', train: 0.3 },
};
// Seconds to send one page's image data: every coded line plus its EOL, padded with fill bits up to
// the receiver's minimum line time (so the printer can keep up), plus RTC at the end.
export function pageSeconds(bm, rate, msltMs = 10) {
  const min = Math.ceil((msltMs / 1000) * rate);
  let b = RTC_BITS;
  for (let j = 0; j < bm.lines; j++) b += Math.max(bm.bits[j] + EOL_BITS, min);
  return b / rate;
}
// Seconds for the page with no compression at all: 1728 bits a line.
export const rawSeconds = (bm, rate) => (bm.lines * (PELS + EOL_BITS) + RTC_BITS) / rate;

// The T.30 call, phase by phase. `sec` is the real duration (seconds). V.21 messages are about 1 s of
// flags plus the frame at 300 bit/s. who: 'tx' (sending machine) or 'rx' (answering machine).
export function callPlan(modem = 'v29', pageSec = 10, pages = 1) {
  const m = MODEMS[modem], v21 = (bytes) => 1 + (bytes * 8 + 16) / 300;
  const P = [];
  const add = (id, phase, who, kind, sec, text) => P.push({ id, phase, who, kind, sec, text });
  add('CNG', 'A', 'tx', 'cng', 0.5, 'Calling tone, 1100 Hz: "I am a fax."');
  add('gap', 'A', '', 'gap', 0.6, 'The other machine picks up.');
  add('CED', 'A', 'rx', 'ced', 3.0, 'Answer tone, 2100 Hz: "I am a fax too."');
  add('gap', 'A', '', 'gap', 0.08, '');
  add('DIS', 'B', 'rx', 'v21', v21(12), 'DIS at 300 bit/s: "I can do V.17, fine mode, ECM…"');
  add('gap', 'B', '', 'gap', 0.08, '');
  add('DCS', 'B', 'tx', 'v21', v21(30), 'DCS: "Let\'s use ' + m.name + ', fine, A4." (plus its number)');
  add('gap', 'B', '', 'gap', 0.08, '');
  add('TCF', 'B', 'tx', 'data', m.train + 1.5, `Training: ${m.name} warms up, then 1.5 s of zeros to test the line.`);
  add('gap', 'B', '', 'gap', 0.08, '');
  add('CFR', 'B', 'rx', 'v21', v21(3), 'CFR: "Line looks good. Go ahead."');
  add('gap', 'B', '', 'gap', 0.08, '');
  for (let p = 0; p < pages; p++) {
    add('PAGE', 'C', 'tx', 'data', m.train + pageSec, `Page ${p + 1}: the image, as ${m.rate.toLocaleString('en')} bit/s ${m.mod}.`);
    add('gap', 'C', '', 'gap', 0.08, '');
    add(p < pages - 1 ? 'MPS' : 'EOP', 'D', 'tx', 'v21', v21(3), p < pages - 1 ? 'MPS: "More pages coming."' : 'EOP: "That was the last page."');
    add('gap', 'D', '', 'gap', 0.08, '');
    add('MCF', 'D', 'rx', 'v21', v21(3), 'MCF: "Page received fine."');
    add('gap', 'D', '', 'gap', 0.08, '');
  }
  add('DCN', 'E', 'tx', 'v21', v21(3), 'DCN: "Hanging up." Both machines go quiet.');
  let t = 0; P.forEach((p) => { p.t0 = t; t += p.sec; p.t1 = t; });
  P.total = t;
  P.overhead = t - pages * pageSec;
  return P;
}
export const PHASES = { A: 'Call set-up', B: 'Handshake', C: 'Page', D: 'Page done', E: 'Hang up' };

// ---------------------------------------------------------------- the sound of a fax
export const SR = 16000;
function rngOf(seed = 1) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// Build the whole call as samples. Page data is cut to `pageCap` seconds so the demo stays short.
export function callAudio(modem = 'v29', pageCap = 4) {
  const plan = callPlan(modem, pageCap, 1), m = MODEMS[modem], a = new Float32Array(Math.ceil(plan.total * SR) + SR / 4), r = rngOf(9);
  const env = (i, n) => Math.min(1, i / 80, (n - i) / 80);
  for (const p of plan) {
    const i0 = Math.floor(p.t0 * SR), n = Math.floor(p.sec * SR);
    if (p.kind === 'cng' || p.kind === 'ced') {
      const f = p.kind === 'cng' ? 1100 : 2100;
      for (let i = 0; i < n; i++) a[i0 + i] = 0.5 * env(i, n) * Math.sin((2 * Math.PI * f * i) / SR);
    } else if (p.kind === 'v21') {
      // V.21 channel 2: continuous-phase FSK, 1650 Hz for 1, 1850 Hz for 0, 300 bit/s.
      // About 1 s of HDLC flags (01111110), then frame bytes.
      const bits = [];
      const flags = Math.round(300 / 8);
      for (let k = 0; k < flags; k++) bits.push(0, 1, 1, 1, 1, 1, 1, 0);
      while (bits.length < p.sec * 300) bits.push(r() < 0.5 ? 1 : 0);
      let ph = 0;
      for (let i = 0; i < n; i++) { const b = bits[Math.floor((i / SR) * 300)] ?? 1; ph += (2 * Math.PI * (b ? 1650 : 1850)) / SR; a[i0 + i] = 0.4 * env(i, n) * Math.sin(ph); }
    } else if (p.kind === 'data') {
      // High-speed modem: random constellation points at the baud rate, smoothly shaped, on the carrier.
      const sps = SR / m.baud, pts = constellation(modem), nsym = Math.ceil(n / sps) + 2, I = [], Q = [];
      for (let k = 0; k < nsym; k++) {
        const tr = k / m.baud < m.train;     // training: alternate two points (a strong, simple pattern)
        const q = tr ? pts[(k & 1) ? 0 : Math.floor(pts.length / 2)] : pts[Math.floor(r() * pts.length)];
        I.push(q[0]); Q.push(q[1]);
      }
      for (let i = 0; i < n; i++) {
        const u = i / sps, k = Math.floor(u), f = u - k, w = 0.5 - 0.5 * Math.cos(Math.PI * f);
        const ii = I[k] * (1 - w) + I[k + 1] * w, qq = Q[k] * (1 - w) + Q[k + 1] * w;
        const ph = (2 * Math.PI * m.carrier * i) / SR;
        a[i0 + i] = 0.33 * env(i, n) * (ii * Math.cos(ph) - qq * Math.sin(ph));
      }
    }
  }
  for (let i = 0; i < a.length; i++) a[i] += (r() - 0.5) * 0.004;     // a little line hiss
  return { a, plan };
}
// Constellation points, scaled to about ±1.
export function constellation(modem) {
  const pts = [];
  if (modem === 'v27') for (let k = 0; k < 8; k++) pts.push([Math.cos((k * Math.PI) / 4 + Math.PI / 8), Math.sin((k * Math.PI) / 4 + Math.PI / 8)]);
  else if (modem === 'v29') {
    // V.29 at 9600: 8 phases, two amplitudes on each (a 16-point star-like set).
    for (let k = 0; k < 8; k++) { const ph = (k * Math.PI) / 4, odd = k & 1, r1 = odd ? Math.SQRT2 : 1, r2 = odd ? 3 * Math.SQRT2 : 3; for (const rr of [r1, r2]) pts.push([(rr * Math.cos(ph)) / 4.3, (rr * Math.sin(ph)) / 4.3]); }
  } else {
    // V.17 at 14,400: 128 points in a cross-shaped square grid (12 × 12 minus the corners).
    for (let y = -5.5; y <= 5.5; y++) for (let x = -5.5; x <= 5.5; x++) if (!(Math.abs(x) > 3.5 && Math.abs(y) > 3.5)) pts.push([x / 6.3, y / 6.3]);
  }
  return pts;
}
// Magnitude spectrum (dB) of a window of samples starting at i0, Hann-windowed, size a power of two.
export function spectrumAt(a, i0, size = 1024) {
  const re = new Float32Array(size), im = new Float32Array(size);
  for (let i = 0; i < size; i++) re[i] = (a[i0 + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  for (let i = 1, j = 0; i < size; i++) { let bit = size >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let len = 2; len <= size; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < size; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr; re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
  const out = new Float32Array(size / 2);
  for (let k = 0; k < size / 2; k++) out[k] = 10 * Math.log10(1e-10 + (re[k] ** 2 + im[k] ** 2) / (size * size / 16));
  out.hz = SR / size;
  return out;
}

// A small player: sound only after a real click, silent when muted or while the studio records.
let ctx = null, master = null, gestured = false;
const live = new Set();
if (typeof window !== 'undefined') ['pointerdown', 'keydown', 'touchstart'].forEach((t) => window.addEventListener(t, () => { gestured = true; }, { capture: true, passive: true }));
export const recording = () => document.body.classList.contains('gb-reel') || /[?&]reel=1/.test(location.search);
export const player = {
  play(samples, gain = 0.8) {
    if (audio.muted || recording() || !(gestured || navigator.userActivation?.hasBeenActive)) return null;
    try {
      ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (!master) { master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination); }
      const b = ctx.createBuffer(1, samples.length, SR); b.copyToChannel(samples, 0);
      const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = b; g.gain.value = gain;
      src.connect(g).connect(master); src.start(); live.add(src); src.onended = () => live.delete(src);
      return { src, t0: ctx.currentTime };
    } catch { return null; }
  },
  now() { return ctx ? ctx.currentTime : 0; },
  stopAll() { live.forEach((s) => { try { s.stop(); } catch { /* done */ } }); live.clear(); },
  sync() { if (master && ctx) { const want = audio.muted || recording() ? 0 : 0.9; if (Math.abs(master.gain.value - want) > 0.01) master.gain.setTargetAtTime(want, ctx.currentTime, 0.02); if (!want && live.size) this.stopAll(); } },
  get playing() { return live.size > 0; },
};

// ---------------------------------------------------------------- line noise and ECM
// Flip bits at random with probability ber, using geometric gaps (fast even for tiny ber).
export function noisy(bits, ber, r) {
  if (ber <= 0) return { bits, flips: 0 };
  let out = null, flips = 0, i = -1;
  const lg = Math.log(1 - ber);
  for (;;) { i += 1 + Math.floor(Math.log(1 - r()) / lg); if (i >= bits.length) break; out ||= bits.split(''); out[i] = out[i] === '1' ? '0' : '1'; flips++; }
  return { bits: out ? out.join('') : bits, flips };
}
// Receive a page over a noisy line. Without ECM, every line with a flipped bit prints damaged.
// With ECM (T.4 Annex A), the data travels in 256-byte frames with a checksum; bad frames are
// asked for again (PPR) until the block is complete, so the page prints perfectly but takes longer.
export const ECM_FRAME_BITS = 256 * 8 + 48;   // data plus address, control, FCS and a flag
export function receive(bm, ber, ecm, rate, seed = 1) {
  const r = rngOf(seed), rows = [], bad = [];
  let damaged = 0, codedBits = 0;
  for (let j = 0; j < bm.lines; j++) {
    const code = encodeLine(bm.rows[j]); codedBits += code.length + EOL_BITS;
    if (ecm) { rows.push(bm.rows[j]); bad.push(false); continue; }
    const n = noisy(code, ber, r);
    if (!n.flips) { rows.push(bm.rows[j]); bad.push(false); continue; }
    const d = decodeLine(n.bits); rows.push(new Uint8Array(d.row)); bad.push(true); damaged++;
  }
  let frames = Math.ceil(codedBits / (256 * 8)), resent = 0, rounds = 0;
  if (ecm && ber > 0) {
    const pf = 1 - Math.pow(1 - ber, ECM_FRAME_BITS);
    let left = frames;
    while (left > 0 && rounds < 8) { let fail = 0; for (let k = 0; k < left; k++) if (r() < pf) fail++; if (!fail) break; resent += fail; left = fail; rounds++; }
  }
  const extra = ecm ? (resent * ECM_FRAME_BITS) / rate + rounds * 2.6 : 0;   // resent frames + a PPR/answer round each
  return { rows, bad, damaged, frames, resent, rounds, extra };
}

// ---------------------------------------------------------------- 3D helpers
// A flat strip that follows a curve, width along X, for paper paths. uv.y runs 0→1 along the curve.
export function ribbon(points, width, mat, segs = 80) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.1);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, p = curve.getPointAt(u);
    pos.push(-width / 2, p.y, p.z, width / 2, p.y, p.z); uv.push(0, 1 - u, 1, 1 - u);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.curve = curve;
  return m;
}
// A page texture (the sheet as the sender sees it), sized w × h px.
export function pageTexture(kind, w = 420, h = 594) {
  const t = canvasTexture(w, h, (g, W, H, k = kind) => paintPage(g, W, H, k));
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping;
  return t;
}
// Draw a bitmap (or its first `upto` lines) into a 2D context region, scaled.
const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null;
export function drawBitmap(g, rows, x, y, w, h, { upto = rows.length, bad = null, ink = [20, 20, 28], paper = [250, 250, 244], badInk = null } = {}) {
  const sx = Math.max(1, Math.round(PELS / w)), W = Math.floor(PELS / sx), n = rows.length, sy = Math.max(1, n / h), H = Math.max(1, Math.floor(n / sy));
  scratch.width = W; scratch.height = H;
  const sg = scratch.getContext('2d'), img = sg.createImageData(W, H), d = img.data;
  for (let j = 0; j < H; j++) {
    const r0 = Math.floor(j * sy), r1 = Math.max(r0 + 1, Math.floor((j + 1) * sy)), shown = r0 < upto;
    let isBad = false; if (bad) for (let r = r0; r < r1; r++) if (bad[r]) isBad = true;
    const col = isBad && badInk ? badInk : ink;
    for (let i = 0; i < W; i++) {
      let k = 0; for (let r = r0; r < r1 && r < n; r++) for (let q = 0; q < sx; q++) k += rows[r][i * sx + q];
      const v = shown ? k / ((r1 - r0) * sx) : 0, o = (j * W + i) * 4;
      d[o] = paper[0] + (col[0] - paper[0]) * Math.min(1, v * 1.6); d[o + 1] = paper[1] + (col[1] - paper[1]) * Math.min(1, v * 1.6); d[o + 2] = paper[2] + (col[2] - paper[2]) * Math.min(1, v * 1.6);
      d[o + 3] = shown ? 255 : 0;
    }
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.drawImage(scratch, x, y, w, h);
}

// Board helpers (canvas-texture panels).
export function panel(g, w, h) { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(9,11,16,.92)'; g.fillRect(0, 0, w, h); }
export function txt(g, s, x, y, font = '20px sans-serif', col = 'rgba(255,255,255,.82)', align = 'left') { g.font = font; g.fillStyle = col; g.textAlign = align; g.fillText(s, x, y); g.textAlign = 'left'; }
export const COL = { cng: '#ffb547', ced: '#5ce1a9', v21: '#c49bff', data: '#8ef0ff', gap: '#444', white: '#e8eef8', black: '#ff7a59', bad: '#ff5a8a', good: '#7be08c', hot: '#ffd166', soft: 'rgba(255,255,255,.55)' };
export function boardMesh(tex, w, h) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide })); }
export const inReel = () => document.body.classList.contains('gb-reel');
export function fitNarrow(stage, minor = [], y0 = -0.12) {
  const narrow = stage.host.clientWidth < 560;
  minor.forEach((l) => { if (l) l.visible = !narrow; });
  const y = narrow && !inReel() ? y0 : 0;
  if (!stage.shift || stage.shift[1] !== y) stage.setShift(0, y);
  return narrow;
}

// ---------------------------------------------------------------- a generic desktop fax machine
// 1 unit = 10 cm. Front faces +Z. About 32 cm wide, 24 cm deep, 11 cm tall, like a 1990s office fax.
// Parts are returned so chapters can explode them, light them and scroll the paper.
export function makeFax({ detail = true } = {}) {
  const g = new THREE.Group(), P = {};
  const shellMat = M.plastic(0xd9d6cc, { transparent: true, opacity: 1 });
  const darkMat = M.plastic(0x2c2f36);
  // Lower body and top cover (the cover lifts off in the exploded view)
  P.base = new THREE.Group(); g.add(P.base);
  const base = box(3.2, 0.5, 2.4, shellMat); base.position.y = 0.3; P.base.add(base);
  for (const [x, z] of [[-1.4, -1.0], [1.4, -1.0], [-1.4, 1.0], [1.4, 1.0]]) { const f = box(0.25, 0.05, 0.25, darkMat); f.position.set(x, 0.03, z); P.base.add(f); }
  P.cover = new THREE.Group(); g.add(P.cover);
  const top = box(3.2, 0.34, 1.7, shellMat); top.position.set(0, 0.72, -0.35); P.cover.add(top);
  const front = box(3.2, 0.2, 0.7, shellMat); front.position.set(0, 0.62, 0.85); front.rotation.x = 0.28; P.cover.add(front);
  P.shells = [base, top, front];
  // Control panel: LCD, keypad, start and stop
  P.panel = new THREE.Group(); P.panel.position.set(0.55, 0.75, 0.82); P.panel.rotation.x = 0.28; g.add(P.panel);
  P.lcd = canvasTexture(256, 64, (c, w, h, s1 = 'READY  12:30', s2 = 'FINE  204x196') => { c.fillStyle = '#b8d8a8'; c.fillRect(0, 0, w, h); c.fillStyle = '#1f2a1a'; c.font = 'bold 22px monospace'; c.fillText(s1, 10, 26); c.fillText(s2, 10, 54); });
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ map: P.lcd.tex, toneMapped: false })); lcd.rotation.x = -Math.PI / 2; lcd.position.set(-0.5, 0.11, -0.12); P.panel.add(lcd);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const k = box(0.12, 0.05, 0.08, M.plastic(0xf2f0ea)); k.position.set(0.25 + c * 0.17, 0.11, -0.2 + r * 0.11); P.panel.add(k); }
  const start = box(0.22, 0.06, 0.14, M.plastic(0x3fae6a)); start.position.set(0.95, 0.11, 0.05); P.panel.add(start);
  const stop = box(0.22, 0.06, 0.14, M.plastic(0xd9534f)); stop.position.set(0.95, 0.11, -0.15); P.panel.add(stop);
  // Document feeder tray at the back, sloping up, with the sheet to send
  P.tray = new THREE.Group(); g.add(P.tray);
  const tray = box(2.4, 0.03, 1.2, darkMat); tray.position.set(0, 1.2, -1.45); tray.rotation.x = 0.55; P.tray.add(tray);
  // Paper paths. Sender: tray → slot → over the CIS bar → out at the front. Receiver: roll → head → out.
  P.docPath = [[0, 1.55, -2.0], [0, 1.2, -1.45], [0, 0.95, -0.95], [0, 0.78, -0.35], [0, 0.74, 0.15], [0, 0.78, 0.6], [0, 0.95, 1.05], [0, 1.02, 1.35]];
  P.rxPath = [[0, 0.62, -0.95], [0, 0.52, -0.55], [0, 0.47, 0.15], [0, 0.49, 0.55], [0, 0.44, 1.15], [0, 0.4, 1.65]];
  // CIS scanner bar under the document path: LEDs, rod-lens array and a row of sensors
  P.cis = new THREE.Group(); P.cis.position.set(0, 0.66, 0.15); g.add(P.cis);
  const cisBody = box(2.3, 0.1, 0.16, darkMat); P.cis.add(cisBody);
  P.cisGlow = box(2.2, 0.012, 0.035, M.glow(0x9dffcb)); P.cisGlow.position.y = 0.056; P.cis.add(P.cisGlow);
  // Feed rollers either side of the scan line
  P.rollers = new THREE.Group(); g.add(P.rollers);
  for (const [y, z] of [[0.86, -0.35], [0.86, 0.6]]) { const r = rod(-1.1, 1.1, 0.07, 0.07, M.matte(0x3a3a3a)); r.position.set(0, y, z); P.rollers.add(r); }
  // Thermal paper roll and print head over a rubber platen roller
  P.roll = new THREE.Group(); P.roll.position.set(0, 0.62 - 0.26, -0.95); g.add(P.roll);
  P.roll.add(rod(-1.1, 1.1, 0.26, 0.26, M.matte(0xf4f2ea))); P.roll.add(rod(-1.15, 1.15, 0.06, 0.06, M.plastic(0x8a8f99)));
  P.platen = rod(-1.1, 1.1, 0.1, 0.1, M.matte(0x222428)); P.platen.position.set(0, 0.37, 0.55); g.add(P.platen);
  P.head = new THREE.Group(); P.head.position.set(0, 0.56, 0.55); g.add(P.head);
  P.head.add(box(2.25, 0.08, 0.18, M.metal(0x9aa0aa)));
  P.headLine = box(2.16, 0.012, 0.025, M.glow(0xff7a3d)); P.headLine.position.y = -0.045; P.head.add(P.headLine);
  // Electronics: modem + controller board, power supply, speaker, stepper motor
  P.board = new THREE.Group(); P.board.position.set(0.85, 0.1, -0.35); g.add(P.board);
  P.board.add(box(1.2, 0.03, 0.9, M.matte(0x1f7a4a)));
  const chips = [[-0.25, -0.1, 0.34, 0.3], [0.25, 0.15, 0.25, 0.2], [0.3, -0.25, 0.18, 0.14], [-0.35, 0.28, 0.2, 0.12]];
  chips.forEach(([x, z, w, d]) => { const c = box(w, 0.05, d, M.plastic(0x1b1d22)); c.position.set(x, 0.04, z); P.board.add(c); });
  const xtal = box(0.1, 0.05, 0.05, M.metal(0xc8cdd6)); xtal.position.set(0.05, 0.04, -0.3); P.board.add(xtal);
  P.psu = new THREE.Group(); P.psu.position.set(-0.95, 0.1, -0.5); g.add(P.psu);
  P.psu.add(box(0.9, 0.03, 0.7, M.matte(0x1f5a7a)));
  const tr = box(0.28, 0.22, 0.22, M.matte(0xd8b34a)); tr.position.set(-0.15, 0.12, 0); P.psu.add(tr);
  for (let i = 0; i < 2; i++) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 14), M.plastic(0x2b2f6a)); cap.position.set(0.2, 0.1, -0.15 + i * 0.25); P.psu.add(cap); }
  P.motor = new THREE.Group(); P.motor.position.set(1.35, 0.55, 0.2); g.add(P.motor);
  P.motor.add(rod(-0.12, 0.12, 0.13, 0.13, M.metal(0x8e959f)));
  P.speaker = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 20), darkMat); P.speaker.position.set(-1.1, 0.12, 0.7); g.add(P.speaker);
  // Phone line: RJ11 jack on the back, a curly-free cord to a wall socket
  P.jack = new THREE.Group(); P.jack.position.set(1.1, 0.32, -1.2); g.add(P.jack);
  P.jack.add(box(0.2, 0.14, 0.04, darkMat));
  const hole = box(0.09, 0.07, 0.02, M.matte(0x0a0a0a)); hole.position.z = -0.02; P.jack.add(hole);
  // Handset on the left, like many office faxes
  if (detail) {
    P.handset = new THREE.Group(); P.handset.position.set(-1.25, 0.97, 0.15); g.add(P.handset);
    P.handset.add(beamZ(1.2, 0.09, darkMat));
    for (const z of [-0.55, 0.55]) { const e = box(0.24, 0.12, 0.26, darkMat); e.position.set(0, -0.03, z); P.handset.add(e); }
  }
  return { group: g, P, shellMat };
}
function beamZ(len, r, mat) { const m = box(r * 2, r * 1.4, len, mat); return m; }
export { clamp };
