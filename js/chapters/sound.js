// Chapter 4: sending sound. A phone line only carries sound (about 300–3,400 Hz), so the modem turns
// bits into tones. The T.30 call: CNG (1100 Hz) from the caller, CED (2100 Hz) from the answerer,
// V.21 FSK messages at 300 bit/s (1650/1850 Hz) to agree on settings, a training check (TCF), then the
// page at high speed: V.27 ter 4,800, V.29 9,600 or V.17 14,400 bit/s. The sound is generated here,
// sample by sample, from those specs, and the spectrum board is an FFT of the same samples.
import { THREE, M, tube, canvasTexture, clamp } from '../kit.js';
import {
  makeFax, MODEMS, PAGES, RES, bitmap, pageSeconds, callPlan, callAudio, PHASES, SR, spectrumAt, constellation,
  player, panel, txt, boardMesh, fitNarrow, COL, inReel,
} from '../fax.js';

const KIND_COL = { cng: 0xffb547, ced: 0x5ce1a9, v21: 0xc49bff, data: 0x8ef0ff, gap: 0x333333 };
const PAUSE = 1.5;

export default {
  id: 'sound',
  short: 'Sending sound',
  title: 'Sending the page as sound',
  subtitle: 'Beeps, a warble, then a hiss: two modems agreeing and talking fast.',
  view: { pos: [-0.4, 3.0, 8.4], target: [-0.3, 2.3, 0] },
  learn: `<p>A phone line was built for voices. It carries sound from about <b>300 to 3,400 Hz</b> and nothing else. So the fax's <b>modem</b> turns bits into sound, and the other modem turns sound back into bits.</p>
    <p>Every fax call starts with a <b>handshake</b>, set by the standard T.30. The caller beeps a <b>calling tone</b> at 1,100 Hz that says "I am a fax". The answering machine replies with a long <b>answer tone</b> at 2,100 Hz. Then they swap short messages at a slow, safe <b>300 bits a second</b>, using two tones (1,650 Hz for 1, 1,850 Hz for 0): that is the warble. "I can do fine mode and 14,400." "OK, let's use that."</p>
    <p>Next comes <b>training</b>: 1.5 seconds of test data at full speed. If it arrives clean, the receiver says "go ahead". Then the page itself pours through as a rushing hiss. A fast modem changes the <b>phase and loudness</b> of its tone 2,400 times a second, and each change carries several bits. <b>V.29</b> carries 4 bits per change for <b>9,600 bit/s</b>; <b>V.17</b> carries 6 for <b>14,400 bit/s</b>. WaveClear explains the waves and tones themselves.</p>
    <p class="tip"><b>Try it:</b> press "Play the handshake" with sound on and follow the spectrum board: one spike, another spike, a pair of spikes, then a wide hump. Then use the calculator: change the page, resolution and modem and see how long the call takes.</p>`,
  terms: [
    { t: 'Handshake', d: 'The opening exchange where two machines agree on speed, resolution and paper size.' },
    { t: 'CNG', d: 'Calling tone: 1,100 Hz beeps from a machine that is calling to send a fax.' },
    { t: 'CED', d: 'Answer tone: 2,100 Hz from the machine that picks up.' },
    { t: 'FSK', d: 'Frequency-shift keying: sending 1s and 0s as two different pitches.' },
    { t: 'QAM', d: 'Quadrature amplitude modulation: each change of the tone\'s phase and loudness stands for several bits.' },
    { t: 'Baud', d: 'Changes of the signal per second. V.29 makes 2,400, carrying 4 bits each.' },
    { t: 'Training', d: 'A test burst at full speed so the receiver can tune itself to the line.' },
  ],
  defaults: { modem: 'v29', page: 'note', res: 'fine', pages: 1 },
  controls: [
    { key: 'play', type: 'buttons', label: 'Listen', items: [{ label: 'Play the handshake', act: (s, inst) => inst.play?.() }, { label: 'Stop', act: (s, inst) => inst.stop?.() }] },
    { key: 'modem', type: 'seg', label: 'Modem', options: Object.entries(MODEMS).map(([v, m]) => ({ v, label: `${m.name} · ${m.rate / 1000}k` })), fmt: (v) => `${MODEMS[v].mod}, ${MODEMS[v].baud} baud` },
    { key: 'page', type: 'seg', label: 'Calculator: page', options: Object.entries(PAGES).filter(([v]) => v !== 'yours').map(([v, p]) => ({ v, label: p.short })) },
    { key: 'res', type: 'seg', label: 'Calculator: resolution', options: [{ v: 'std', label: 'Standard' }, { v: 'fine', label: 'Fine' }] },
    { key: 'pages', type: 'range', label: 'Calculator: pages', min: 1, max: 20, step: 1, fmt: (v) => `${v} page${v > 1 ? 's' : ''}` },
  ],
  quiz: [
    { q: 'Why does a fax send its data as sound?', options: ['Sound is faster than electricity', 'A phone line only carries sound in the voice range', 'So people can listen in', 'Paper is made of sound'], answer: 1, why: 'The phone network was built to carry voices, about 300–3,400 Hz, so bits must travel as tones.' },
    { q: 'What is the steady 2,100 Hz tone at the start of a fax call?', options: ['The page data', 'The answer tone from the receiving fax', 'A busy signal', 'The paper feeding'], answer: 1, why: 'CED, the answer tone, tells the caller a fax machine has picked up.' },
    { q: 'How does V.17 reach 14,400 bits a second at 2,400 changes a second?', options: ['It uses a faster phone line', 'Each change of phase and loudness carries 6 bits', 'It skips the white parts', 'It sends two pages at once'], answer: 1, why: '2,400 changes × 6 bits = 14,400 bits a second.' },
  ],
  reel: [
    { ms: 5600, caption: 'The fax song is two modems talking: a beep, an answer tone, then a warble at 300 bits a second.', set: { modem: 'v29' }, act: (s, inst) => inst.seek?.(2.2), spin: 0, view: { pos: [0, 2.7, 6.9], target: [0, 1.75, -0.4] } },
    { ms: 5000, caption: 'Then the page rushes through as a hiss: 9,600 bits a second on V.29, 14,400 on V.17.', set: { modem: 'v17' }, act: (s, inst) => inst.seek?.(12.2), spin: 0, view: { pos: [0, 2.7, 6.9], target: [0, 1.75, -0.4] } },
  ],

  build({ stage }) {
    const root = new THREE.Group(); stage.root.add(root);
    // Two machines and the phone line between them
    const A = makeFax({ detail: true }), B = makeFax({ detail: true });
    A.group.scale.setScalar(0.55); A.group.position.set(-3.0, 0, -0.6); A.group.rotation.y = 0.45; root.add(A.group);
    B.group.scale.setScalar(0.55); B.group.position.set(3.0, 0, -0.6); B.group.rotation.y = -0.45; root.add(B.group);
    const linePts = [[-2.4, 0.2, -0.2], [-1.8, 0.06, 0.45], [-0.8, 0.06, 0.8], [0, 0.06, 0.85], [0.8, 0.06, 0.8], [1.8, 0.06, 0.45], [2.4, 0.2, -0.2]];
    const wire = tube(linePts, 0.03, M.plastic(0xe8e6de), false, 120); root.add(wire);
    const curve = new THREE.CatmullRomCurve3(linePts.map((p) => new THREE.Vector3(...p)));
    const NP = 42, pulses = [];
    for (let i = 0; i < NP; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M.glow(0xffffff)); root.add(m); pulses.push(m); }
    const L = {
      a: stage.label('Sending fax', [-3.0, 1.15, -0.6], root),
      b: stage.label('Receiving fax', [3.0, 1.15, -0.6], root),
      line: stage.label('Phone line: sound only, 300–3,400 Hz', [0, 0.35, 0.9], root, 'hot'),
    };

    // Boards: the spectrum (with the constellation during fast data) and the call timeline
    const sp = canvasTexture(1200, 940, (g, w, h, s) => {
      if (!s) return panel(g, w, h);
      paintSpec(g, w, 640, s);
      g.save(); g.translate(0, 650); paintLine(g, w, 290, s); g.restore();
    });
    const spm = boardMesh(sp.tex, 4.3, 3.37); spm.position.set(1.35, 2.15, -1.3); root.add(spm);

    let t = 0, audioT0 = null, st = null, snd = null, sndKey = '', cur = null;
    const sound = (m) => { if (sndKey !== m) { sndKey = m; snd = callAudio(m, 4); } return snd; };
    const segAt = (plan, tt) => plan.find((p) => tt >= p.t0 && tt < p.t1) || plan[plan.length - 1];

    function paintSpec(g, w, h, s) {
      panel(g, w, h);
      const { a, plan } = sound(s.modem), seg = segAt(plan, t), i0 = clamp(Math.floor(t * SR) - 512, 0, a.length - 1024);
      const spec = spectrumAt(a, i0, 1024);
      txt(g, 'What the line is carrying now', 24, 40, 'bold 26px sans-serif', COL.white);
      txt(g, seg.id === 'gap' ? 'silence' : `${seg.id}: ${seg.text}`, 24, 72, '20px sans-serif', COL[seg.kind] || COL.soft);
      const X = 60, Y = 110, W = w - 90, H = h - 170, fmax = 4000;
      const fx = (f) => X + (f / fmax) * W;
      g.fillStyle = 'rgba(123,224,140,.08)'; g.fillRect(fx(300), Y, fx(3400) - fx(300), H);
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1;
      for (let f = 0; f <= fmax; f += 500) { g.beginPath(); g.moveTo(fx(f), Y); g.lineTo(fx(f), Y + H); g.stroke(); txt(g, f ? `${f}` : '0 Hz', fx(f), Y + H + 24, '16px sans-serif', COL.soft, 'center'); }
      txt(g, 'phone band 300–3,400 Hz', fx(1850), Y + 20, '16px sans-serif', 'rgba(123,224,140,.8)', 'center');
      // the spectrum
      g.beginPath(); g.moveTo(X, Y + H);
      for (let k = 1; k < spec.length; k++) { const f = k * spec.hz; if (f > fmax) break; const v = clamp((spec[k] + 80) / 80, 0, 1); g.lineTo(fx(f), Y + H - v * H); }
      g.lineTo(fx(fmax), Y + H); g.closePath();
      const c = COL[seg.kind] || '#888'; g.fillStyle = c + '55'; g.fill(); g.strokeStyle = c; g.lineWidth = 2; g.stroke();
      // markers for the tones of the standard
      for (const [f, n] of [[1100, 'CNG'], [1650, '1'], [1850, '0'], [2100, 'CED']]) { g.strokeStyle = 'rgba(255,209,102,.5)'; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(fx(f), Y + 30); g.lineTo(fx(f), Y + H); g.stroke(); g.setLineDash([]); txt(g, n, fx(f), Y + 46, '15px sans-serif', COL.hot, 'center'); }
      // constellation during fast data
      if (seg.kind === 'data') {
        const m = MODEMS[s.modem], pts = constellation(s.modem), cx = w - 150, cy = 230, R = 95;
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(cx - R - 20, cy - R - 40, 2 * R + 40, 2 * R + 70);
        txt(g, `${m.points} points: ${m.bps} bits each`, cx, cy - R - 16, '15px sans-serif', COL.white, 'center');
        const pick = Math.floor(t * 12) % pts.length;
        pts.forEach(([x, y], k) => { g.fillStyle = k === pick ? '#ffd166' : '#8ef0ff'; g.beginPath(); g.arc(cx + x * R, cy - y * R, k === pick ? 6 : pts.length > 64 ? 2.2 : 4, 0, Math.PI * 2); g.fill(); });
      }
    }
    function paintLine(g, w, h, s) {
      panel(g, w, h);
      const plan = callPlan(s.modem, 4, 1), X = 20, W = w - 40, sx = (tt) => X + (tt / plan.total) * W;
      txt(g, 'The call, second by second (page shortened to 4 s here)', 20, 36, 'bold 24px sans-serif', COL.white);
      let lastPhase = '';
      for (const p of plan) {
        if (p.kind === 'gap') continue;
        const y = p.who === 'tx' ? 70 : 150;
        g.fillStyle = COL[p.kind]; g.globalAlpha = t >= p.t0 ? 0.95 : 0.35; g.fillRect(sx(p.t0), y, Math.max(2, sx(p.t1) - sx(p.t0) - 2), 60); g.globalAlpha = 1;
        if (sx(p.t1) - sx(p.t0) > 50) txt(g, p.id, (sx(p.t0) + sx(p.t1)) / 2, y + 38, 'bold 18px sans-serif', '#0a0c10', 'center');
        if (p.phase !== lastPhase) { lastPhase = p.phase; txt(g, `${p.phase}: ${PHASES[p.phase]}`, sx(p.t0), h - 22, '16px sans-serif', COL.soft); }
      }
      txt(g, 'sender →', X, 64, '15px sans-serif', COL.soft); txt(g, '← receiver', X, 226, '15px sans-serif', COL.soft);
      const px = sx(Math.min(t, plan.total)); g.fillStyle = '#fff'; g.fillRect(px - 1.5, 56, 3, 176);
    }

    const inst = {
      play() {
        t = 0; player.stopAll();
        const h = player.play(sound(st.modem).a, 0.7);
        audioT0 = h ? h.t0 : null;
      },
      stop() { player.stopAll(); audioT0 = null; },
      seek(x) { t = x; audioT0 = null; },
      update(dt, s) {
        dt = Math.max(0, dt); st = s; player.sync();
        const narrow = fitNarrow(stage, [L.line], -0.1);
        spm.position.set(inReel() ? 0 : 1.35, inReel() ? 2.6 : 2.15, -1.3);
        const { plan } = sound(s.modem);
        // follow the audio clock while the sound plays, otherwise run the model clock
        if (audioT0 !== null && player.playing) t = player.now() - audioT0;
        else { if (audioT0 !== null) audioT0 = null; t += dt; if (t > plan.total + PAUSE) t = 0; }
        const seg = segAt(plan, t);
        cur = seg;
        // pulses on the wire: direction by who is talking, colour by what
        const on = seg.kind !== 'gap' && t < plan.total, col = KIND_COL[seg.kind] || 0x333333;
        pulses.forEach((m, i) => {
          const speed = seg.kind === 'data' ? 0.5 : seg.kind === 'v21' ? 0.25 : 0.18;
          let u = ((t * speed + i / NP) % 1); if (seg.who === 'rx') u = 1 - u;
          m.position.copy(curve.getPointAt(u)); m.visible = on;
          m.material.color.setHex(col); m.scale.setScalar(seg.kind === 'data' ? 0.6 + 0.6 * ((i * 7) % 3) / 2 : 1);
        });
        A.P.headLine.material.color.setHex(0x331a10); B.P.headLine.material.color.setHex(seg.phase === 'C' ? 0xff7a3d : 0x331a10);
        A.P.cisGlow.material.color.setHex(seg.phase === 'C' ? 0x9dffcb : 0x1c3a2c);
        
        const fk = Math.floor(t * 15);
        if (fk !== inst._fk) { inst._fk = fk; sp.redraw(s); }
      },
      readout(s) {
        const m = MODEMS[s.modem], bm = bitmap(s.page, s.res), ps = pageSeconds(bm, m.rate, 10), plan = callPlan(s.modem, ps, s.pages), seg = cur;
        return `<div class="big">${seg && seg.id !== 'gap' ? `${seg.id} · ${PHASES[seg.phase]}` : 'Listening…'}</div>
          <div class="row"><span>${m.name}</span><b>${m.baud.toLocaleString('en')} baud × ${m.bps} bits = ${m.rate.toLocaleString('en')} bit/s</b></div>
          <div class="row"><span>Image per page (${PAGES[s.page].short.toLowerCase()}, ${RES[s.res].name.toLowerCase()})</span><b>${ps.toFixed(1)} s</b></div>
          <div class="row"><span>Handshake and replies</span><b>${plan.overhead.toFixed(1)} s</b></div>
          <div class="row"><span>Whole call, ${s.pages} page${s.pages > 1 ? 's' : ''}</span><b>${fmtTime(plan.total)}</b></div>
          <small>Real modems may drop to a slower speed on a noisy line. Times assume a 10 ms minimum line time.</small>`;
      },
      dispose() { player.stopAll(); },
    };
    return inst;
  },
};
function fmtTime(sec) { return sec < 90 ? `${sec.toFixed(0)} s` : `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s`; }
