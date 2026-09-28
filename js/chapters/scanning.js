// Chapter 2: scanning. The page slides over the CIS bar and each thin line becomes 1728 black or white
// pixels (T.4). Standard mode takes 3.85 lines per mm down the page (204 × 98 dpi), fine mode 7.7 (204 × 196).
// The sensor reads a grey level for every spot; the machine compares it with a threshold to pick black
// or white. You can draw your own page on the sheet.
import { THREE, M, box, canvasTexture, clamp } from '../kit.js';
import {
  PAGES, RES, PELS, linesFor, bitmap, greyRow, paintPage, drawBitmap, doodle, forgetYours,
  panel, txt, boardMesh, fitNarrow, COL,
} from '../fax.js';

const PW = 2.1, PH = 2.97;                 // the sheet in model units (1 unit = 10 cm)
const WIN = 48;                             // pixels shown in the close-up of one line

export default {
  id: 'scanning',
  short: 'Scanning',
  title: 'Turning a page into dots',
  subtitle: 'One thin line at a time, every spot is judged black or white.',
  view: { pos: [-0.5, 3.9, 7.2], target: [-0.6, 3.3, 0] },
  onChange(s, key) { if (key === 'draw' && s.draw) s.page = 'yours'; if (key === 'page' && s.page !== 'yours') s.draw = false; },
  learn: `<p>A fax doesn't see letters or pictures. It sees <b>dots</b>. The page slides over the scanner bar, and the bar reads one thin <b>scan line</b> across it: <b>1,728 spots</b> along 215 mm, about 8 per millimetre, or <b>204 per inch</b>.</p>
    <p>Each spot reflects some light back to its sensor. Paper reflects a lot, ink very little. The machine compares each reading with a <b>threshold</b>: darker than the line means <b>black</b>, lighter means <b>white</b>. There is no grey. One bit per dot.</p>
    <p>Then the paper steps forward and the next line is read. In <b>standard</b> mode the steps are 3.85 lines per mm (about 98 per inch), so an A4 page becomes about <b>1,144 lines</b>. <b>Fine</b> mode takes twice as many, 7.7 per mm (196 per inch), for small print. That is 204 × 98 or 204 × 196 dots per inch, set by the Group 3 fax standard, ITU-T T.4.</p>
    <p>Photos are a problem: with no grey, a fax fakes it with a <b>halftone</b>, a pattern of tiny dots, like a newspaper photo.</p>
    <p class="tip"><b>Try it:</b> switch the page and resolution and watch the bitmap build on the right. Slide the threshold to the ends to see faint and bold copies. Then turn on "Draw on the page", draw something with your finger or mouse, and scan it.</p>`,
  terms: [
    { t: 'Scan line', d: 'One thin strip across the page, read all at once by the scanner bar.' },
    { t: 'Pixel (pel)', d: 'One dot of the picture; fax standards call it a picture element, or pel.' },
    { t: 'Threshold', d: 'The grey level that decides whether a dot counts as black or white.' },
    { t: 'Bitmap', d: 'A picture stored as a grid of dots, one bit each: 1 for black, 0 for white.' },
    { t: 'Resolution', d: 'How many dots per inch: 204 across, and 98 (standard) or 196 (fine) down the page.' },
    { t: 'Halftone', d: 'Shades of grey faked with patterns of tiny black dots.' },
  ],
  defaults: { page: 'note', res: 'std', threshold: 128, speed: 60, draw: false },
  controls: [
    { key: 'page', type: 'seg', label: 'Page to send', options: Object.entries(PAGES).map(([v, p]) => ({ v, label: p.short })), fmt: (v) => PAGES[v].name },
    { key: 'res', type: 'seg', label: 'Resolution', options: [{ v: 'std', label: 'Standard 204×98' }, { v: 'fine', label: 'Fine 204×196' }] },
    { key: 'threshold', type: 'range', label: 'Black/white threshold', min: 30, max: 230, step: 1, ends: ['only the darkest ink', 'almost everything'], fmt: (v) => `grey < ${v} → black` },
    { key: 'speed', type: 'range', label: 'Scan speed (model)', min: 10, max: 300, step: 1, fmt: (v) => `${v} lines/s` },
    { key: 'draw', type: 'toggle', label: 'Draw on the page', hint: 'Drag on the sheet to draw. The scan pauses while you draw.' },
    { key: 'clear', type: 'buttons', label: 'Your drawing', items: [{ label: 'Clear my drawing', act: () => { doodle.strokes = []; doodle.v++; forgetYours(); } }] },
  ],
  quiz: [
    { q: 'How many dots does a Group 3 fax read across one line of the page?', options: ['204', '1,728', '8', '1,000,000'], answer: 1, why: '1,728 dots along 215 mm: about 8 per mm, or 204 per inch.' },
    { q: 'What does fine mode change?', options: ['It adds colour', 'It reads twice as many lines down the page', 'It reads more dots across each line', 'It sends faster'], answer: 1, why: 'Fine mode steps 7.7 lines per mm instead of 3.85: 196 lines per inch instead of 98. Across, it stays 204.' },
    { q: 'How does a fax send the grey in a photo?', options: ['It sends grey dots', 'It sends a halftone: patterns of tiny black dots', 'It cannot send photos at all', 'It sends the photo as text'], answer: 1, why: 'Every dot is black or white, so grey is faked with dot patterns, like a newspaper photo.' },
  ],
  reel: [
    { ms: 5400, caption: 'The scanner reads one thin line at a time: 1,728 dots, each judged black or white.', set: { page: 'note', res: 'std', threshold: 128, draw: false }, anim: { speed: [40, 160] }, spin: 0, view: { pos: [0, 2.3, 4.8], target: [0, 1.75, 0] } },
    { ms: 4600, caption: 'Fine mode reads twice as many lines, and photos become patterns of tiny dots.', set: { page: 'photo', res: 'fine', threshold: 128, draw: false }, anim: { speed: [120, 300] }, spin: 0, view: { pos: [0, 2.3, 4.8], target: [0, 1.75, 0] } },
  ],

  build({ stage }) {
    const root = new THREE.Group(); stage.root.add(root);
    // ---- the sheet on a sloped bed, sliding up through the scanner bar
    const bed = new THREE.Group(); bed.position.set(-1.25, 3.4, 0); bed.rotation.x = -0.08; root.add(bed);
    const pageTex = canvasTexture(420, 594, (g, w, h, k = 'note') => paintPage(g, w, h, k));
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshStandardMaterial({ map: pageTex.tex, roughness: 0.85, side: THREE.DoubleSide }));
    bed.add(sheet);
    const bar = new THREE.Group(); bed.add(bar);
    const barBody = box(PW + 0.4, 0.14, 0.14, M.plastic(0x2c2f36, { transparent: true, opacity: 0.55 })); barBody.position.z = -0.1; bar.add(barBody);
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(PW + 0.1, 0.018), M.glow(0x9dffcb, { transparent: true, opacity: 0.95, side: THREE.DoubleSide })); beam.position.z = 0.004; bar.add(beam);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(PW + 0.1, 0.16), M.ghost(0x9dffcb, 0.18)); glow.position.z = 0.003; bar.add(glow);
    // scanned-so-far shading (the part of the page already past the bar)
    const done = new THREE.Mesh(new THREE.PlaneGeometry(PW, 1), M.ghost(0x8ef0ff, 0.08)); done.position.z = 0.002; bed.add(done);

    // ---- boards: the bitmap as it builds, and a close-up of the current line
    const bmB = canvasTexture(520, 740, (g, w, h, s) => (s && bm ? paintBM(g, w, h, s) : panel(g, w, h)));
    const bmMesh = boardMesh(bmB.tex, 2.1, 3.0); bmMesh.position.set(1.25, 3.4, -0.1); root.add(bmMesh);
    const lnB = canvasTexture(1100, 440, (g, w, h, s) => (s && bm ? paintLine(g, w, h, s) : panel(g, w, h)));
    const lnMesh = boardMesh(lnB.tex, 4.6, 1.84); lnMesh.position.set(0, 1.0, 0.55); lnMesh.rotation.x = -0.3; root.add(lnMesh);

    const L = {
      bar: stage.label('CIS bar: 1,728 sensors', [PW / 2 + 0.25, 0, 0], bar, 'hot'),
      page: stage.label('Your page (face down in a real fax)', [-PW / 2 - 0.2, -PH / 2 + 0.4, 0], sheet),
      bm: stage.label('The bitmap so far', [1.25, 5.05, -0.1], root),
    };

    // ---- drawing on the sheet
    const ray = new THREE.Raycaster(), v2 = new THREE.Vector2(), el = stage.renderer.domElement;
    let st = null, drawing = null;
    const uvAt = (e) => { const b = el.getBoundingClientRect(); v2.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); ray.setFromCamera(v2, stage.camera); const h = ray.intersectObject(sheet)[0]; return h?.uv ? [h.uv.x * 210, (1 - h.uv.y) * 297] : null; };
    const down = (e) => { if (!st?.draw) return; const p = uvAt(e); if (!p) return; drawing = [p]; doodle.strokes.push(drawing); stage.controls.enabled = false; e.preventDefault(); };
    const move = (e) => { if (!drawing) return; const p = uvAt(e); if (p) { drawing.push(p); pageKey = ''; } };
    const up = () => { if (!drawing) return; drawing = null; doodle.v++; forgetYours(); stage.controls.enabled = true; pageKey = ''; };
    el.addEventListener('pointerdown', down, true); el.addEventListener('pointermove', move); window.addEventListener('pointerup', up);

    let t = 0, pageKey = '', bmKey = '', lnKey = '', bm = null, line = 0;
    const paintBM = (g, w, h, s) => {
      panel(g, w, h);
      txt(g, `${RES[s.res].name}: ${RES[s.res].dpi} dpi`, 20, 34, 'bold 24px sans-serif', COL.white);
      txt(g, `line ${Math.min(line + 1, bm.lines).toLocaleString('en')} of ${bm.lines.toLocaleString('en')}`, 20, 62, '18px sans-serif', COL.soft);
      const x = 20, y = 80, W = w - 40, H = W * 297 / 210;
      g.fillStyle = 'rgba(244,242,234,.16)'; g.fillRect(x, y, W, H);
      drawBitmap(g, bm.rows, x, y, W, H, { upto: line + 1 });
      const yy = y + ((line + 1) / bm.lines) * H;
      g.fillStyle = '#9dffcb'; g.fillRect(x, yy - 1, W, 2);
    };
    const paintLine = (g, w, h, s) => {
      panel(g, w, h);
      const grey = greyRow(s.page, s.res, line), row = bm.rows[line];
      // where to zoom: around the first black dot on the line, or the middle if the line is blank
      let first = row.indexOf(1); if (first < 0) first = PELS / 2;
      const x0 = clamp(first - 16, 0, PELS - WIN);
      txt(g, `Line ${line + 1}: ${PELS.toLocaleString('en')} dots. Close-up of dots ${x0 + 1}–${x0 + WIN}`, 20, 38, 'bold 30px sans-serif', COL.white);
      // the whole line, squeezed
      const X = 20, Wd = w - 40;
      for (let i = 0; i < 432; i++) { let k = 0; for (let q = 0; q < 4; q++) k += row[i * 4 + q]; g.fillStyle = k ? '#111' : '#f4f2ea'; g.fillRect(X + (i * Wd) / 432, 56, Wd / 432 + 0.6, 30); }
      g.strokeStyle = '#ffd166'; g.lineWidth = 2; g.strokeRect(X + (x0 / PELS) * Wd, 53, (WIN / PELS) * Wd, 36);
      // sensor readings (bars) and the threshold, then the decided pixels
      const cw = Wd / WIN, gy = 130, gh = 170;
      for (let i = 0; i < WIN; i++) {
        const v = grey[x0 + i], b = row[x0 + i];
        const hh = ((255 - v) / 255) * gh;
        g.fillStyle = b ? 'rgba(255,122,89,.85)' : 'rgba(142,240,255,.55)';
        g.fillRect(X + i * cw + 1, gy + gh - hh, cw - 2, Math.max(1, hh));
        g.fillStyle = b ? '#111' : '#f4f2ea'; g.fillRect(X + i * cw + 1, gy + gh + 14, cw - 2, cw - 2);
      }
      const ty = gy + gh - ((255 - s.threshold) / 255) * gh;
      g.strokeStyle = '#ffd166'; g.setLineDash([8, 6]); g.beginPath(); g.moveTo(X, ty); g.lineTo(X + Wd, ty); g.stroke(); g.setLineDash([]);
      txt(g, 'darkness read by each sensor', X, gy + 16, '22px sans-serif', COL.soft);
      txt(g, 'threshold', X + Wd, ty - 8, 'bold 22px sans-serif', COL.hot, 'right');
      txt(g, 'decided: 1 = black, 0 = white', X, h - 10, '22px sans-serif', COL.soft);
      if (s.page === 'photo') txt(g, 'photo: a halftone pattern, not one threshold', X + Wd, h - 10, '22px sans-serif', COL.hot, 'right');
    };

    return {
      update(dt, s) {
        dt = Math.max(0, dt); t += dt; st = s;
        const narrow = fitNarrow(stage, [L.page, L.bm], -0.08);
        const pk = `${s.page}|${s.page === 'yours' ? doodle.v + ':' + (doodle.strokes.at(-1)?.length || 0) : ''}`;
        if (pk !== pageKey) { pageKey = pk; pageTex.redraw(s.page); }
        bm = bitmap(s.page, s.res, s.threshold);
        if (!s.draw && !drawing) line = Math.floor(t * s.speed) % bm.lines;
        else line = 0;
        const f = s.draw ? 0.5 : (line + 0.5) / bm.lines;
        // In a fax the paper moves past a fixed bar. Here the bar moves down the page instead, so you can watch it.
        bar.position.y = (0.5 - f) * PH;
        done.visible = !s.draw; done.scale.y = Math.max(0.001, f * PH); done.position.y = PH / 2 - (f * PH) / 2;
        bar.visible = !s.draw;
        bed.position.x = -1.25;
        const bk = `${s.page}|${s.res}|${s.threshold}|${doodle.v}|${Math.floor(line / Math.max(1, Math.round(bm.lines / 140)))}`;
        if (bk !== bmKey) { bmKey = bk; bmB.redraw(s); }
        const lk = `${bk}|${line}`;
        if (lk !== lnKey) { lnKey = lk; lnB.redraw(s); }
        beam.material.opacity = 0.7 + 0.3 * Math.sin(t * 30);
      },
      readout(s) {
        const b = bitmap(s.page, s.res, s.threshold), n = linesFor(s.res), px = n * PELS;
        return `<div class="big">${RES[s.res].name}: ${RES[s.res].dpi} dpi</div>
          <div class="row"><span>${PELS.toLocaleString('en')} dots a line ×</span><b>${n.toLocaleString('en')} (${RES[s.res].lpmm} per mm)</b></div>
          <div class="row"><span>Dots on the page</span><b>${(px / 1e6).toFixed(2)} million = ${(px / 8 / 1024).toFixed(0)} KB</b></div>
          <div class="row"><span>Black dots on this page</span><b>${(b.black * 100).toFixed(1)}%</b></div>
          <small>Raw at 9,600 bit/s: ${Math.round(px / 9600)} s a page. Chapter 3 squeezes it.</small>`;
      },
      dispose() { el.removeEventListener('pointerdown', down, true); el.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); stage.controls.enabled = true; },
    };
  },
};
