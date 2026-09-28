// Chapter 3: squeezing the page with Modified Huffman run-length coding (ITU-T T.4, one-dimensional).
// Each line is described as alternating runs of white and black, always starting with white. Every run
// length gets a code from fixed tables: short codes for common runs (2–7 white, 2–3 black), a make-up
// code for each multiple of 64. Every line ends with the 12-bit EOL. The coder here is the real one:
// the same tables and bit counts a Group 3 fax uses, run on the page you pick.
import { THREE, M, box, canvasTexture, clamp } from '../kit.js';
import {
  PAGES, RES, PELS, EOL, EOL_BITS, bitmap, runsOf, runCodes, paintPage, panel, txt, boardMesh, fitNarrow, COL,
  pageSeconds, rawSeconds, inReel,
} from '../fax.js';

const PW = 2.1, PH = 2.97, NB = 99;          // page size (units) and bars in the skyline
const X0 = 0.45, Y0 = 3.55;                  // page centre (the page stands up, facing you)

export default {
  id: 'squeeze',
  short: 'Squeezing the page',
  title: 'Squeezing the page: run-length codes',
  subtitle: 'Why a page that is mostly white goes down the line in seconds.',
  view: { pos: [-1.3, 3.9, 9.9], target: [-1.2, 3.2, 0] },
  learn: `<p>An A4 page in standard mode is about <b>2 million dots</b>. Sending every dot at 9,600 bits a second would take over three minutes. But most of a page is <b>white</b>, and neighbouring dots are usually the same colour.</p>
    <p>So a fax doesn't send dots. It sends <b>runs</b>: "312 white, 4 black, 20 white…". Each line starts with a white run and then takes turns. This is <b>run-length encoding</b>.</p>
    <p>The run lengths are then turned into bits with a code book called <b>Modified Huffman</b>, from the Group 3 standard, T.4. Runs that happen often get short codes: 2 to 7 white dots take just <b>4 bits</b>, and 2 or 3 black dots take just <b>2 bits</b>. Rare runs get longer codes. Long runs use a <b>make-up code</b> for each block of 64 dots, plus a short <b>terminating code</b> for the rest.</p>
    <p>A completely white line of 1,728 dots becomes a make-up code and a terminating code: <b>17 bits</b>, plus a 12-bit <b>end-of-line</b> marker. That is why a letter squeezes 10 to 20 times, while a photo made of tiny halftone dots can come out even <b>bigger</b> than the raw dots.</p>
    <p class="tip"><b>Try it:</b> slide "Line on the page" through the text and the drawing and read the codes on the board. Then switch to the photo and the blank page and compare the squeeze ratio.</p>`,
  terms: [
    { t: 'Run', d: 'A row of neighbouring dots that are all the same colour.' },
    { t: 'Run-length encoding', d: 'Describing a line by how long each run is, instead of dot by dot.' },
    { t: 'Modified Huffman (MH)', d: 'The fax code book: short bit patterns for common run lengths, longer ones for rare runs.' },
    { t: 'Make-up code', d: 'A code for a whole multiple of 64 dots, used in front of a terminating code for long runs.' },
    { t: 'EOL', d: 'End of line: 000000000001, a pattern no run code can make, so the receiver can always find the next line.' },
    { t: 'Compression ratio', d: 'Raw size divided by squeezed size. 15:1 means 15 times smaller.' },
  ],
  defaults: { page: 'note', res: 'std', at: 0.276 },
  controls: [
    { key: 'page', type: 'seg', label: 'Page', options: Object.entries(PAGES).map(([v, p]) => ({ v, label: p.short })), fmt: (v) => PAGES[v].name },
    { key: 'res', type: 'seg', label: 'Resolution', options: [{ v: 'std', label: 'Standard' }, { v: 'fine', label: 'Fine' }] },
    { key: 'at', type: 'range', label: 'Line on the page', min: 0, max: 0.999, step: 0.001, ends: ['top', 'bottom'], fmt: (v, s) => `line ${Math.floor(v * bitmap(s.page, s.res).lines) + 1}` },
  ],
  quiz: [
    { q: 'What does a fax send for each line instead of every dot?', options: ['A photo of the line', 'The lengths of the white and black runs, as short codes', 'Only the black dots', 'The letters it recognised'], answer: 1, why: 'Runs of the same colour are counted, and each count becomes a Modified Huffman code.' },
    { q: 'Why do some run lengths get very short codes?', options: ['They are the most common', 'They are the longest', 'They are black', 'Random choice'], answer: 0, why: 'Like Morse code giving E a single dot, the commonest runs get the shortest codes.' },
    { q: 'Which page takes longest to send?', options: ['A nearly blank page', 'A typed letter', 'A photo made of tiny halftone dots', 'All take the same time'], answer: 2, why: 'Tiny dots mean very short runs, so there are thousands of codes per line and little squeezing.' },
  ],
  reel: [
    { ms: 5400, caption: 'A fax sends runs, not dots: "312 white, 4 black", each turned into a short code.', set: { page: 'note', res: 'std' }, anim: { at: [0.27, 0.62] }, spin: 0, view: { pos: [1.55, 2.0, 5.3], target: [1.55, 1.6, 0] } },
  ],

  build({ stage }) {
    const root = new THREE.Group(); stage.root.add(root);
    // ---- the page, standing up
    const pageTex = canvasTexture(420, 594, (g, w, h, k = 'note') => paintPage(g, w, h, k));
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshStandardMaterial({ map: pageTex.tex, roughness: 0.9, side: THREE.DoubleSide }));
    sheet.position.set(X0, Y0, 0); root.add(sheet);
    const cursor = box(PW + 0.25, 0.012, 0.02, M.glow(0xffd166)); root.add(cursor);
    // ---- the run strip: one box per run, just in front of the chosen line
    const strip = new THREE.Group(); root.add(strip);
    const white = M.plastic(0xdff6ff, { transparent: true, opacity: 0.85 }), black = M.plastic(0xff7a59);
    const runBoxes = [];
    // ---- bits per slice of the page, as bars to the right, against a ghost for 1,728 bits (raw)
    const sky = new THREE.Group(); sky.position.set(X0 + PW / 2 + 0.12, Y0, 0); root.add(sky);
    const LR = 2.0;                            // length of a raw line (1,728 bits)
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(LR, PH), M.ghost(0x8ef0ff, 0.08)); wall.position.set(LR / 2, 0, -0.03); sky.add(wall);
    const wallEdge = box(0.015, PH, 0.015, M.glow(0x8ef0ff)); wallEdge.position.set(LR, 0, -0.03); sky.add(wallEdge);
    const bars = [];
    for (let i = 0; i < NB; i++) { const b = box(1, (PH / NB) * 0.8, 0.06, M.plastic(0x8ef0ff)); b.position.set(0.5, PH / 2 - (i + 0.5) * PH / NB, 0); b.castShadow = false; sky.add(b); bars.push(b); }
    const L = {
      raw: stage.label('Raw: 1,728 bits a line', [LR * 0.5, PH / 2 + 0.18, 0], sky),
      mh: stage.label('Coded bits, slice by slice', [0.4, -PH / 2 - 0.15, 0], sky, 'hot'),
      strip: stage.label('Runs on this line', [0, 0, 0], strip),
    };
    // ---- the code board
    const cb = canvasTexture(1400, 520, (g, w, h, s) => (s ? paintCodes(g, w, h, s) : panel(g, w, h)));
    const cbm = boardMesh(cb.tex, 5.2, 1.93); cbm.position.set(-1.0, 1.05, 1.1); cbm.rotation.x = -0.35; root.add(cbm);

    let cur = null;
    function paintCodes(g, w, h, s) {
      panel(g, w, h);
      const { runs, bits, j } = cur, MAXR = 9;
      txt(g, `Line ${j + 1}: ${runs.length} runs → ${bits} bits + ${EOL_BITS}-bit EOL, instead of ${PELS.toLocaleString('en')}`, 24, 46, 'bold 32px sans-serif', COL.white);
      let y = 100;
      for (let i = 0; i < runs.length && i < MAXR; i++) {
        const blk = i & 1, cs = runCodes(runs[i], blk);
        txt(g, `${blk ? 'black' : 'white'} ${String(runs[i]).padStart(4)}`, 24, y, '26px monospace', blk ? COL.black : COL.white);
        g.font = 'bold 26px monospace';
        let x = 250;
        cs.forEach((c) => {
          txt(g, `${c.n}:`, x, y, '20px sans-serif', COL.soft); g.font = '20px sans-serif'; x += g.measureText(`${c.n}: `).width + 4;
          txt(g, c.code, x, y, 'bold 26px monospace', blk ? COL.black : '#8ef0ff'); g.font = 'bold 26px monospace'; x += g.measureText(c.code).width + 26;
        });
        y += 40;
      }
      txt(g, runs.length > MAXR ? `… ${runs.length - MAXR} more runs, then EOL ${EOL}` : `then EOL ${EOL}`, 24, y + 4, '22px monospace', COL.hot);
      // the whole page, on the right
      const pb = cur.page, raw = pb.raw, coded = pb.total + pb.lines * EOL_BITS, ratio = raw / coded;
      const X = 900, bw = w - X - 30;
      txt(g, 'Whole page', X, 110, 'bold 28px sans-serif', COL.white);
      g.fillStyle = 'rgba(142,240,255,.3)'; g.fillRect(X, 130, bw, 44);
      txt(g, `raw: ${(raw / 1e6).toFixed(2)} million bits`, X + 12, 161, '22px sans-serif', COL.white);
      g.fillStyle = COL.hot; g.fillRect(X, 190, Math.min(bw, Math.max(4, bw / ratio)), 44);
      txt(g, `coded: ${Math.round(coded / 1000).toLocaleString('en')} thousand`, X + Math.min(bw - 200, Math.max(4, bw / ratio)) + 12, 221, '22px sans-serif', COL.white);
      txt(g, ratio >= 1 ? `${ratio.toFixed(1)}× smaller` : `${(1 / ratio).toFixed(1)}× BIGGER`, X, 300, 'bold 48px sans-serif', ratio >= 1 ? COL.good : COL.bad);
      txt(g, 'white line: 17 bits + EOL', X, 350, '22px sans-serif', COL.soft);
      txt(g, `black dots on page: ${(pb.black * 100).toFixed(1)}%`, X, 385, '22px sans-serif', COL.soft);
    }

    let pageKey = '', drawKey = '';
    return {
      update(dt, s) {
        dt = Math.max(0, dt);
        const narrow = fitNarrow(stage, [L.raw, L.strip, L.mh], -0.22);
        cbm.position.x = inReel() || narrow ? 1.55 : -1.0;
        root.position.x = narrow && !inReel() ? -2.75 : 0;     // on a phone, stack the board under the page
        if (s.page !== pageKey) { pageKey = s.page; pageTex.redraw(s.page); }
        const pb = bitmap(s.page, s.res), j = clamp(Math.floor(s.at * pb.lines), 0, pb.lines - 1);
        const y = Y0 + PH / 2 - (j + 0.5) / pb.lines * PH;
        cursor.position.set(X0, y, 0.02);
        const k = `${s.page}|${s.res}|${j}`;
        if (cur && cur.page !== pb) drawKey = '';
        if (k !== drawKey) {
          drawKey = k;
          const runs = runsOf(pb.rows[j]);
          cur = { runs, bits: pb.bits[j], j, page: pb };
          // run boxes
          runBoxes.forEach((b) => strip.remove(b)); runBoxes.length = 0;
          let x = 0;
          runs.forEach((n, i) => {
            if (!n) return;
            const wdt = (n / PELS) * PW, b = box(Math.max(0.004, wdt - 0.003), i & 1 ? 0.09 : 0.05, i & 1 ? 0.14 : 0.06, i & 1 ? black : white);
            b.position.set(X0 - PW / 2 + x + wdt / 2, 0, i & 1 ? 0.1 : 0.06); strip.add(b); runBoxes.push(b); x += wdt;
          });
          strip.position.y = y;
          L.strip.position.set(X0 - PW / 2 - 0.1, 0.12, 0.1);
          // skyline: average coded bits per line in each slice of the page
          for (let i = 0; i < NB; i++) {
            const a = Math.floor((i / NB) * pb.lines), e = Math.max(a + 1, Math.floor(((i + 1) / NB) * pb.lines));
            let sum = 0; for (let r = a; r < e; r++) sum += pb.bits[r] + EOL_BITS;
            const avg = sum / (e - a), len = Math.max(0.01, (avg / PELS) * LR);
            bars[i].scale.x = len; bars[i].position.x = len / 2;
            bars[i].material.color.setHex(j >= a && j < e ? 0xffd166 : avg > PELS ? 0xff5a8a : 0x8ef0ff);
          }
          cb.redraw(s);
        }
      },
      readout(s) {
        const pb = bitmap(s.page, s.res), coded = pb.total + pb.lines * EOL_BITS + 72, ratio = pb.raw / coded;
        const t96 = pageSeconds(pb, 9600, 10), raw96 = rawSeconds(pb, 9600);
        return `<div class="big">${ratio >= 1 ? ratio.toFixed(1) + ' : 1 squeeze' : 'Grew ' + (1 / ratio).toFixed(1) + '× bigger'}</div>
          <div class="row"><span>${PAGES[s.page].name}, ${RES[s.res].name.toLowerCase()}</span><b>${pb.lines.toLocaleString('en')} lines</b></div>
          <div class="row"><span>Raw bits</span><b>${pb.raw.toLocaleString('en')}</b></div>
          <div class="row"><span>Modified Huffman bits</span><b>${coded.toLocaleString('en')}</b></div>
          <div class="row"><span>At 9,600 bit/s: raw → coded</span><b>${Math.round(raw96)} s → ${t96.toFixed(1)} s</b></div>
          <small>An all-white line costs 17 bits + 12 for EOL. Short lines are padded up to the receiver's minimum line time (here 10 ms), so even a blank page takes about 12 s at 9,600 bit/s.</small>`;
      },
    };
  },
};
