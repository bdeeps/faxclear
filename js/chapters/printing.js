// Chapter 5: printing. The receiver decodes each line and fires the matching heaters on a thermal print
// head (1728 elements across the page, about 8 per mm) against heat-sensitive paper, which darkens where
// it is heated (leuco dye + developer melting together, practical lower limit about 100 °C: Wikipedia,
// "Thermal paper"). Line noise flips bits: with plain Group 3 coding a flipped bit throws the run codes
// out until the next EOL, so that line prints as a streak (the decoder here is the real MH decoder run on
// the flipped bits). With ECM (T.4 Annex A) the data travels in 256-byte frames with a checksum and
// damaged frames are sent again, so the page is perfect but the call takes longer.
import { THREE, M, box, rod, canvasTexture, clamp, swarm } from '../kit.js';
import {
  PAGES, RES, PELS, bitmap, receive, drawBitmap, ribbon, panel, txt, boardMesh, fitNarrow, COL, pageSeconds, inReel,
} from '../fax.js';

const PW = 2.1, PH = 2.97, NDOT = 144;       // heater dots drawn (each stands for 12 real ones)
const RATE = 9600;

export default {
  id: 'printing',
  short: 'Printing',
  title: 'Printing with heat, and fixing mistakes',
  subtitle: 'A row of tiny heaters rebuilds the page, line by line, on paper that darkens when warm.',
  view: { pos: [2.3, 3.4, 5.4], target: [0.3, 1.75, -0.2] },
  learn: `<p>At the other end, the modem turns the sound back into bits, and the machine decodes the run codes back into lines of black and white dots.</p>
    <p>A classic fax prints on <b>thermal paper</b>. The <b>thermal print head</b> is a bar with a row of <b>1,728 tiny heaters</b>, one for every dot across the page. For each line, the heaters under black dots get a pulse of current lasting about a millisecond and warm up. The paper's coating holds a colourless <b>dye</b> and a <b>developer</b>; where they get hot enough, about 100 °C, they melt together and turn black. Then a <b>stepper motor</b> turns the platen roller one line forward.</p>
    <p>Thermal paper needs no ink, but it curls, fades in sunlight and can't be written on well. From the 1990s, <b>plain-paper faxes</b> used an inkjet or laser engine instead (see PrinterClear).</p>
    <p>Phone lines crackle. A <b>flipped bit</b> turns one run code into another, the colours slip sideways and that line prints as a <b>streak</b>, until the next end-of-line marker puts things right. <b>Error correction mode (ECM)</b> fixes this: the data is sent in numbered frames of 256 bytes, each with a checksum. The receiver lists the bad frames, and the sender sends just those again.</p>
    <p class="tip"><b>Try it:</b> turn ECM off and push the line noise up. Watch streaks appear on the page. Then turn ECM on: the page comes out clean, and the readout shows how many frames were sent twice.</p>`,
  terms: [
    { t: 'Thermal paper', d: 'Paper coated with a dye and developer that turn black when heated.' },
    { t: 'Heating element', d: 'One of the tiny resistors on the print head; it gets hot when current flows.' },
    { t: 'Bit error', d: 'A 1 that arrives as a 0, or a 0 as a 1, because of noise on the line.' },
    { t: 'ECM', d: 'Error correction mode: data in checked frames, with bad frames sent again.' },
    { t: 'Checksum (FCS)', d: 'A number calculated from a frame\'s bits, so the receiver can tell if any bit changed.' },
    { t: 'Plain-paper fax', d: 'A fax that prints with an inkjet or laser engine on ordinary paper.' },
  ],
  defaults: { page: 'map', res: 'std', ber: 2e-5, ecm: false, kind: 'thermal', speed: 80 },
  controls: [
    { key: 'page', type: 'seg', label: 'Page arriving', options: Object.entries(PAGES).map(([v, p]) => ({ v, label: p.short })) },
    { key: 'ber', type: 'log', label: 'Line noise (bit error rate)', min: 1e-7, max: 3e-4, ends: ['quiet line', 'crackly'], fmt: (v) => `1 bit in ${Math.round(1 / v).toLocaleString('en')}` },
    { key: 'ecm', type: 'toggle', label: 'Error correction mode (ECM)', hint: 'Frames of 256 bytes with a checksum; bad frames are sent again.' },
    { key: 'kind', type: 'seg', label: 'Printer', options: [{ v: 'thermal', label: 'Thermal paper' }, { v: 'plain', label: 'Plain paper' }] },
    { key: 'res', type: 'seg', label: 'Resolution', options: [{ v: 'std', label: 'Standard' }, { v: 'fine', label: 'Fine' }] },
    { key: 'speed', type: 'range', label: 'Print speed (model)', min: 20, max: 300, step: 1, fmt: (v) => `${v} lines/s` },
    { key: 'again', type: 'buttons', label: 'Page', items: [{ label: 'Receive it again', act: (s, inst) => inst.again?.() }] },
  ],
  quiz: [
    { q: 'What makes the dots black on thermal fax paper?', options: ['Ink sprayed on', 'Heat from tiny heaters melts a dye and developer together', 'Light from a laser', 'Pressure from pins'], answer: 1, why: 'The coating is colourless until it is heated to about 100 °C, then it turns black.' },
    { q: 'Why can one flipped bit spoil a whole line?', options: ['The paper tears', 'The run codes get out of step until the next end-of-line', 'The modem hangs up', 'It doesn\'t: one bit is one dot'], answer: 1, why: 'The codes have different lengths, so one wrong bit makes the decoder read the wrong codes after it.' },
    { q: 'How does ECM fix errors?', options: ['It guesses the missing dots', 'It resends only the frames whose checksum failed', 'It prints the page twice', 'It slows the paper'], answer: 1, why: 'Each 256-byte frame has a checksum; the receiver asks for the bad ones again.' },
  ],
  reel: [
    { ms: 5200, caption: 'A row of 1,728 tiny heaters prints each line on paper that turns black when warm.', set: { page: 'map', res: 'std', ber: 1e-7, ecm: false, kind: 'thermal', speed: 90 }, act: (s, inst) => inst.again?.(0), spin: 0, view: { pos: [1.3, 3.2, 4.3], target: [0, 2.0, -0.2] } },
    { ms: 5200, caption: 'Line noise flips bits and smears whole lines. Error correction mode sends the bad frames again.', set: { page: 'note', res: 'std', ber: 1.5e-4, ecm: false, kind: 'thermal', speed: 160 }, act: (s, inst) => inst.again?.(0.35), anim: { ecm: [false, true] }, spin: 0, view: { pos: [1.3, 3.2, 4.3], target: [0, 2.0, -0.2] } },
  ],

  build({ stage }) {
    const root = new THREE.Group(); stage.root.add(root);
    // ---- mechanism: roll at the front, platen roller, head on top, printed paper rising out at the back
    const HY = 0.9;                                       // height of the print line
    const roll = new THREE.Group(); roll.position.set(0, 0.55, 1.6); root.add(roll);
    roll.add(rod(-1.15, 1.15, 0.45, 0.45, M.matte(0xf4f2ea))); roll.add(rod(-1.2, 1.2, 0.1, 0.1, M.plastic(0x8a8f99)));
    const platen = rod(-1.15, 1.15, 0.3, 0.3, M.matte(0x232529)); platen.position.set(0, HY - 0.3, 0); root.add(platen);
    const head = new THREE.Group(); head.position.set(0, HY, 0); root.add(head);
    const headBody = box(2.35, 0.16, 0.36, M.metal(0x9aa0aa)); headBody.position.y = 0.11; head.add(headBody);
    const heat = box(2.2, 0.03, 0.34, M.plastic(0x4a3a2e)); heat.position.y = 0.21; head.add(heat);
    const sink = new THREE.Group(); head.add(sink);
    for (let i = 0; i < 14; i++) { const f = box(0.04, 0.22, 0.34, M.metal(0xb9bec8)); f.position.set(-1.05 + i * 0.162, 0.33, 0); sink.add(f); }
    const dots = swarm(NDOT, new THREE.BoxGeometry(PW / NDOT * 0.8, 0.05, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    dots.castShadow = false; head.add(dots);
    const hot = new THREE.Color(0xff5a1f), cold = new THREE.Color(0x3a2a22);
    for (let i = 0; i < NDOT; i++) { dots.place(i, [-PW / 2 + (i + 0.5) * PW / NDOT, 0.05, 0.19]); dots.setColorAt(i, cold); }
    dots.done();
    // feed paper from the roll to the head
    const feed = ribbon([[0, 1.0, 1.6], [0, 0.95, 1.0], [0, HY + 0.005, 0.35], [0, HY + 0.005, 0]], PW, M.matte(0xf4f2ea, { side: THREE.DoubleSide }));
    root.add(feed);
    // the printed page, sliding out and up towards you, the newest line at the head
    const pc = canvasTexture(432, 611, () => {});
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshStandardMaterial({ map: pc.tex, roughness: 0.85, side: THREE.DoubleSide, transparent: true }));
    const out = new THREE.Group(); out.position.set(0, HY, 0); out.rotation.x = -0.8; root.add(out);   // the printed page rises up and back, printed side towards you
    out.add(sheet);
    // plain-paper alternative: a print engine box and a paper cassette
    const engine = new THREE.Group(); root.add(engine);
    const eng = box(2.7, 1.1, 1.3, M.clear(0xb9d7ff, 0.22)); eng.position.set(0, 0.75, -0.4); engine.add(eng);
    const cas = box(2.5, 0.2, 1.8, M.plastic(0x3a3f4b)); cas.position.set(0, 0.1, -0.9); engine.add(cas);
    const L = {
      head: stage.label('Thermal print head: 1,728 heaters', [1.3, 0.3, 0], head, 'hot'),
      platen: stage.label('Platen roller (stepper motor)', [-1.4, HY - 0.3, 0]),
      roll: stage.label('Thermal paper roll', [0, 0.65, 0], roll),
      engine: stage.label('Plain paper: inkjet or laser engine (see PrinterClear)', [0, 1.45, -0.4], engine, 'hot'),
    };

    // ---- board: what arrived, line by line, with damaged lines marked
    const rb = canvasTexture(900, 360, (g, w, h, s) => (s ? paintRx(g, w, h, s) : panel(g, w, h)));
    const rbm = boardMesh(rb.tex, 3.0, 1.2); rbm.position.set(2.75, 2.3, -0.8); rbm.rotation.y = -0.5; root.add(rbm);

    let t = 0, rx = null, rxKey = '', seed = 1, line = 0, drawn = -1, st = null, pageKey = '';
    const get = (s) => {
      const k = `${s.page}|${s.res}|${s.ber.toExponential(2)}|${s.ecm}|${seed}`;
      if (k !== rxKey) { rxKey = k; const bm = bitmap(s.page, s.res); rx = { bm, ...receive(bm, s.ber, s.ecm, RATE, seed) }; drawn = -1; }
      return rx;
    };
    function paintRx(g, w, h, s) {
      panel(g, w, h);
      const r = get(s), n = r.bm.lines, upto = Math.min(line, n);
      let dmg = 0; for (let j = 0; j < upto; j++) if (r.bad[j]) dmg++;
      txt(g, s.ecm ? 'ECM on: checked frames' : 'ECM off: plain Group 3', 24, 42, 'bold 28px sans-serif', s.ecm ? COL.good : COL.white);
      txt(g, `Lines printed: ${upto.toLocaleString('en')} of ${n.toLocaleString('en')}`, 24, 88, '24px sans-serif', COL.white);
      txt(g, `Damaged lines so far: ${dmg}`, 24, 124, '24px sans-serif', dmg ? COL.bad : COL.good);
      if (s.ecm) {
        txt(g, `Frames of 256 bytes: ${r.frames}`, 24, 170, '22px sans-serif', COL.white);
        txt(g, `Frames sent again: ${r.resent} (in ${r.rounds} extra round${r.rounds === 1 ? '' : 's'})`, 24, 204, '22px sans-serif', r.resent ? COL.hot : COL.good);
        txt(g, `Extra time: ${r.extra.toFixed(1)} s`, 24, 238, '22px sans-serif', COL.white);
      } else txt(g, 'Each flipped bit spoils its line until the next EOL.', 24, 170, '20px sans-serif', COL.soft);
      // a strip showing where damage fell down the page
      const X = 24, Y = h - 60, W = w - 48;
      g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(X, Y, W, 30);
      g.fillStyle = 'rgba(142,240,255,.35)'; g.fillRect(X, Y, (upto / n) * W, 30);
      g.fillStyle = COL.bad; for (let j = 0; j < upto; j++) if (r.bad[j]) g.fillRect(X + (j / n) * W - 1, Y - 6, 3, 42);
      txt(g, 'top of page', X, Y + 54, '16px sans-serif', COL.soft); txt(g, 'bottom', X + W, Y + 54, '16px sans-serif', COL.soft, 'right');
    }

    const inst = {
      again(at = 0) { seed++; t = 0; line = Math.floor(at * (rx?.bm.lines || 1144)); t = line / (st?.speed || 80); },
      update(dt, s) {
        dt = Math.max(0, dt); st = s; t += dt;
        const narrow = fitNarrow(stage, [L.platen, L.roll], -0.1);
        const top = narrow || inReel(); rbm.position.set(top ? 0 : 2.75, top ? 4.1 : 2.3, top ? -1.6 : -0.8); rbm.rotation.y = top ? 0 : -0.5;
        const r = get(s), n = r.bm.lines;
        line = Math.min(n, Math.floor(t * s.speed));
        if (line >= n && t * s.speed > n + s.speed * 2.5) { seed++; t = 0; line = 0; }
        const thermal = s.kind === 'thermal';
        roll.visible = thermal; feed.visible = thermal; dots.visible = thermal; engine.visible = !thermal; head.visible = thermal;
        L.head.visible = thermal; L.roll.visible = thermal && !narrow; L.engine.visible = !thermal;
        // the printed sheet: newest line at the head
        const f = line / n;
        sheet.position.y = (f - 0.5) * PH;                   // the page top leaves first; unprinted part is transparent
        sheet.visible = line > 0;
        // redraw the paper (throttled)
        const step = Math.max(1, Math.round(n / 160));
        const k = `${rxKey}|${Math.floor(line / step)}|${s.kind}`;
        if (k !== pageKey) {
          pageKey = k;
          const g = pc.canvas.getContext('2d');
          g.clearRect(0, 0, 432, 611);
          const paper = thermal ? [246, 244, 236] : [255, 255, 255];
          drawBitmap(g, r.rows, 0, 0, 432, 611, { upto: line, bad: r.bad, badInk: [180, 20, 50], paper, ink: thermal ? [40, 36, 60] : [15, 15, 15] });
          pc.tex.needsUpdate = true;
          rb.redraw(s);
        }
        // heaters: glow where the current line is black
        if (thermal) {
          const row = r.rows[Math.min(n - 1, line)] || r.rows[0], per = PELS / NDOT, c = new THREE.Color();
          for (let i = 0; i < NDOT; i++) { let b = 0; for (let q = 0; q < per; q++) b += row[i * per + q]; c.copy(cold).lerp(hot, line < n ? Math.min(1, (b / per) * 3) : 0); dots.setColorAt(i, c); }
          dots.instanceColor.needsUpdate = true;
          platen.rotation.x -= line < n ? dt * s.speed * 0.004 : 0;
          roll.rotation.x -= line < n ? dt * s.speed * 0.0015 : 0;
        }
      },
      readout(s) {
        const r = get(s), bm = r.bm, ps = pageSeconds(bm, RATE, 10);
        const dmg = r.bad.filter(Boolean).length;
        return `<div class="big">${s.ecm ? (r.resent ? `${r.resent} frame${r.resent > 1 ? 's' : ''} resent, page perfect` : 'Page perfect') : dmg ? `${dmg} damaged line${dmg > 1 ? 's' : ''}` : 'Page clean'}</div>
          <div class="row"><span>Heaters across the head</span><b>${PELS.toLocaleString('en')} (≈ 8 per mm)</b></div>
          <div class="row"><span>Paper darkens at about</span><b>100 °C</b></div>
          <div class="row"><span>Noise</span><b>1 bit in ${Math.round(1 / s.ber).toLocaleString('en')}</b></div>
          <div class="row"><span>Page time at 9,600 bit/s</span><b>${ps.toFixed(1)} s${s.ecm && r.extra ? ` + ${r.extra.toFixed(1)} s resending` : ''}</b></div>
          <small>${s.kind === 'thermal' ? 'Thermal: no ink, simple and cheap, but the print fades and the paper curls.' : 'Plain paper: the page is stored in memory, then printed by an inkjet or laser engine on ordinary paper that lasts.'}</small>`;
      },
    };
    return inst;
  },
};
