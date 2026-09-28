// Chapter 6: fax today. Fax over the internet: sending the modem sound through VoIP (G.711 pass-through)
// breaks when packets go missing, because the modem can't tell a gap from a signal change. ITU-T T.38
// (1998) instead sends the fax *data* in packets, repeating earlier packets inside later ones (redundancy),
// so data is lost only when several packets in a row go missing. T.37 (1998) sends the page as an email
// attachment instead. Why fax survives: US hospitals and doctors' offices (Wikipedia "Fax": hospitals are
// the leading users in the US, often because of worries about privacy rules), the UK NHS (the world's
// largest buyer of fax machines in 2017; banned from buying new ones from January 2019: GOV.UK, 9 Dec
// 2018), and Japan (a 2021 push to drop fax in central government met hundreds of objections: Japan Times,
// 9 Aug 2021). India: STD/ISD/PCO booths from the late 1980s; many also offered fax (widely remembered;
// hedged in the text).
// Model: 20 ms packets (50 a second, the usual VoIP packet time). G.711: the page fails if any packet is
// lost while it is being sent (no ECM). T.38 with redundancy r: a gap only if r + 1 packets in a row are lost.
import { THREE, M, box, tube, sphere, canvasTexture, clamp } from '../kit.js';
import { makeFax, MODEMS, bitmap, pageSeconds, callPlan, panel, txt, boardMesh, fitNarrow, COL, inReel } from '../fax.js';

const ROUTES = {
  pstn: { name: 'Phone line', note: 'The classic way: a circuit is held open for the whole call, so the sound arrives smoothly.' },
  g711: { name: 'VoIP, sound as packets', note: 'The modem sound is chopped into 20 ms packets. One lost packet is a hole in the sound, and the modems lose their place.' },
  t38: { name: 'T.38 fax over IP', note: 'A gateway demodulates the fax and sends the bits in packets, each also carrying copies of the last two, then re-creates the sound at the far end.' },
  email: { name: 'Fax to email', note: 'A fax server receives the call and emails the page as an image or PDF attachment (the T.37 idea). The internet resends anything lost.' },
};
const PPS = 50, RED = 2;          // packets per second, T.38 redundancy (copies of earlier packets)

export default {
  id: 'today',
  short: 'Fax today',
  title: 'Fax today: over the internet, and why it survives',
  subtitle: 'Phone lines went digital, and the fax learned to ride in packets.',
  view: { pos: [-0.3, 3.3, 8.5], target: [-0.3, 1.85, -0.3] },
  learn: `<p>Today most phone calls travel over the internet as <b>packets</b>. That is hard on a fax. If the modem sound is simply chopped into packets (<b>VoIP</b>), one lost packet is a gap in the sound, and a fast modem loses its place. The page fails.</p>
    <p>The fix is <b>T.38</b>, agreed in <b>1998</b>. A gateway near each machine listens to the fax, turns the sound back into data, and sends the data in packets, each carrying copies of the packets before it. A single lost packet no longer matters. Another route, <b>fax to email</b>, delivers the page as an attachment.</p>
    <p>Why use fax at all? A fax goes to a <b>phone number</b>, not an inbox. It gives the sender a <b>confirmation report</b> that the other machine took the page, which offices treat as proof. Doctors in the US still fax records, often because of worries about privacy rules for email. The UK's health service was said to be the world's biggest buyer of fax machines in 2017, before it banned new ones. In <b>Japan</b>, a 2021 push to stop faxing in government met hundreds of objections from ministries. Courts and government offices in many countries still accept faxed forms.</p>
    <p>Compared with <b>email</b> or a <b>scanned PDF</b>, a fax is black and white at 204 × 196 dpi at best, but it goes to a phone number and gives a delivery report. Email carries exact text and colour, but proves delivery only if the reader agrees; a scanned PDF is a colour picture of the page, usually sharper than a fax.</p>
    <p>In <b>India</b>, the late 1980s and 1990s were the age of yellow <b>STD/ISD/PCO</b> booths. For many small businesses without their own line, the neighbourhood booth was where you made trunk calls, and many booths also sent and received faxes: order forms, price lists and bank papers. Mobile phones and email later emptied the booths.</p>
    <p class="tip"><b>Try it:</b> pick VoIP and raise the packet loss to 1%. See how often a page gets through. Switch to T.38 at the same loss, then compare fax, email and a scanned PDF on the board.</p>`,
  terms: [
    { t: 'VoIP', d: 'Voice over IP: phone calls sent as internet packets.' },
    { t: 'Packet loss', d: 'The share of packets that never arrive.' },
    { t: 'T.38', d: 'The 1998 standard for sending fax data, not fax sound, over IP networks.' },
    { t: 'Redundancy', d: 'Sending copies of earlier data again, so one lost packet costs nothing.' },
    { t: 'Fax server', d: 'A computer that answers fax calls and turns the pages into files or emails.' },
    { t: 'STD/PCO booth', d: 'A staffed public phone booth in India for local and long-distance calls, often with fax.' },
  ],
  defaults: { route: 'g711', loss: 0.1 },
  controls: [
    { key: 'route', type: 'seg', label: 'How the fax travels', options: Object.entries(ROUTES).map(([v, r]) => ({ v, label: r.name })) },
    { key: 'loss', type: 'range', label: 'Packet loss on the internet', min: 0, max: 5, step: 0.05, ends: ['none', '5%'], fmt: (v) => `${v.toFixed(2)}%` },
  ],
  quiz: [
    { q: 'Why does fax often fail over plain VoIP?', options: ['Packets are too fast', 'A lost packet leaves a gap in the modem sound', 'VoIP blocks paper', 'Faxes need colour'], answer: 1, why: 'The modem relies on a smooth tone; a 20 ms hole makes it lose its place.' },
    { q: 'What does T.38 send over the internet?', options: ['The modem sound', 'The fax data, with copies of earlier packets', 'A photo of the fax machine', 'Only the handshake'], answer: 1, why: 'Gateways turn the sound into data, send it with redundancy, and rebuild the sound at the far end.' },
    { q: 'Why do many offices still trust fax?', options: ['It is in colour', 'It goes to a phone number and gives a confirmation report', 'It is faster than email', 'It needs no electricity'], answer: 1, why: 'The sending machine prints a report showing the other machine accepted the pages.' },
  ],
  reel: [
    { ms: 5400, caption: 'Over the internet, one lost packet can ruin a fax. T.38 sends the data with spare copies.', set: { route: 't38' }, anim: { loss: [0.2, 2.5] }, spin: 0, view: { pos: [0, 3.0, 6.4], target: [0, 2.1, -0.4] } },
  ],

  build({ stage }) {
    const root = new THREE.Group(); stage.root.add(root);
    const A = makeFax(), B = makeFax();
    A.group.scale.setScalar(0.5); A.group.position.set(-3.0, 0, 0.3); A.group.rotation.y = 0.5; root.add(A.group);
    B.group.scale.setScalar(0.5); B.group.position.set(3.0, 0, 0.3); B.group.rotation.y = -0.5; root.add(B.group);
    const gwL = box(0.6, 0.2, 0.45, M.plastic(0x3a3f4b)); gwL.position.set(-1.8, 0.1, -0.4); root.add(gwL);
    const gwR = box(0.6, 0.2, 0.45, M.plastic(0x3a3f4b)); gwR.position.set(1.8, 0.1, -0.4); root.add(gwR);
    for (const g of [gwL, gwR]) for (let i = 0; i < 4; i++) { const l = box(0.05, 0.03, 0.02, M.glow(i % 2 ? 0x5ce1a9 : 0x8ef0ff)); l.position.set(-0.2 + i * 0.12, 0.02, 0.23); g.add(l); }
    const exch = box(1.0, 0.9, 0.6, M.plastic(0x4a5060)); exch.position.set(0, 0.45, 1.0); root.add(exch);
    const cloud = new THREE.Group(); cloud.position.set(0, 1.5, -1.2); root.add(cloud);
    for (const [x, y, z, r] of [[0, 0, 0, 0.7], [-0.7, -0.15, 0.1, 0.5], [0.7, -0.1, 0, 0.55], [0.3, 0.35, -0.1, 0.45], [-0.35, 0.3, 0.05, 0.4]]) { const s = sphere(r, M.ghost(0x8ef0ff, 0.12)); s.position.set(x, y, z); s.castShadow = false; cloud.add(s); }
    const laptop = new THREE.Group(); laptop.position.set(2.0, 0, 1.5); laptop.rotation.y = -0.6; root.add(laptop);
    { const base = box(0.9, 0.04, 0.6, M.metal(0xb9bec8)); base.position.y = 0.02; laptop.add(base); }
    const scr = box(0.9, 0.6, 0.03, M.metal(0xb9bec8)); scr.position.set(0, 0.32, -0.3); scr.rotation.x = -0.25; laptop.add(scr);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), M.glow(0xe8f2ff)); disp.position.set(0, 0.32, -0.28); disp.rotation.x = -0.25; laptop.add(disp);

    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const paths = {
      pstn: [V(-2.6, 0.2, 0.1), V(-1.5, 0.15, 0.9), V(-0.5, 0.6, 1.0), V(0.5, 0.6, 1.0), V(1.5, 0.15, 0.9), V(2.6, 0.2, 0.1)],
      g711: [V(-2.6, 0.2, 0.1), V(-1.8, 0.2, -0.4), V(-1.0, 1.2, -1.1), V(0, 1.6, -1.2), V(1.0, 1.2, -1.1), V(1.8, 0.2, -0.4), V(2.6, 0.2, 0.1)],
      email: [V(-2.6, 0.2, 0.1), V(-1.8, 0.2, -0.4), V(-1.0, 1.2, -1.1), V(0, 1.6, -1.2), V(1.0, 1.2, -1.1), V(1.6, 0.8, 0.4), V(1.9, 0.4, 1.3)],
    };
    paths.t38 = paths.g711;
    const curves = {}, lines = {};
    for (const k of ['pstn', 'g711', 'email']) { curves[k] = new THREE.CatmullRomCurve3(paths[k]); lines[k] = tube(paths[k], 0.02, M.ghost(0xffffff, 0.2), false, 120); lines[k].castShadow = false; root.add(lines[k]); }
    curves.t38 = curves.g711; lines.t38 = lines.g711;
    const NP = 36, pk = [];
    for (let i = 0; i < NP; i++) { const m = box(0.11, 0.11, 0.11, M.glow(0x8ef0ff)); m.castShadow = false; root.add(m); pk.push({ m, lost: false, drop: 0, seen: -1 }); }

    const L = {
      a: stage.label('Sending fax', [-3.0, 0.95, 0.3], root),
      b: stage.label('Receiving fax', [3.0, 0.95, 0.3], root),
      gw: stage.label('Gateway (ATA)', [-1.8, 0.45, -0.4], root),
      cloud: stage.label('The internet', [0, 2.45, -1.2], root),
      ex: stage.label('Telephone exchange', [0, 1.1, 1.0], root),
      lap: stage.label('Inbox: page as a PDF', [2.0, 0.85, 1.5], root, 'hot'),
    };

    // ---- the comparison board
    const cmp = canvasTexture(900, 1080, (g, w, h) => {
      panel(g, w, h);
      txt(g, 'Fax, email or a scanned PDF?', 24, 50, 'bold 36px sans-serif', COL.white);
      const cols = [24, 318, 612], heads = ['Fax', 'Email', 'Scanned PDF'], hc = ['#ffd166', '#8ef0ff', '#c49bff'];
      heads.forEach((s, i) => txt(g, s, cols[i], 112, 'bold 30px sans-serif', hc[i]));
      const rows = [
        ['Goes to', 'a phone number', 'an email address', 'an email address'],
        ['Travels', 'a phone call', 'mail servers', 'mail servers'],
        ['Arrives as', 'paper or image', 'text you can copy', 'picture of a page'],
        ['Detail', '204 × 196 dpi', 'exact text', 'often 200–300 dpi'],
        ['Colour', 'black and white', 'yes', 'yes'],
        ['Proof it arrived', 'machine report', 'not by default', 'not by default'],
        ['Needs', 'fax + phone line', 'internet', 'scanner + internet'],
      ];
      rows.forEach((r, j) => {
        const y = 170 + j * 128;
        g.fillStyle = j % 2 ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.07)'; g.fillRect(12, y - 30, w - 24, 118);
        txt(g, r[0].toUpperCase(), 24, y, 'bold 20px sans-serif', COL.soft);
        for (let i = 0; i < 3; i++) txt(g, r[i + 1], cols[i], y + 52, '26px sans-serif', COL.white);
      });
    });
    const cm = boardMesh(cmp.tex, 2.75, 3.3); cm.position.set(2.85, 1.95, -0.6); cm.rotation.y = -0.3; stage.root.add(cm);
    root.position.x = -1.0; root.scale.setScalar(0.85);

    let t = 0, st = null;
    const pageT = () => pageSeconds(bitmap('note', 'std'), MODEMS.v29.rate, 10);   // a one-page handwritten note, standard mode
    const odds = (s) => {
      const p = s.loss / 100, n = PPS * pageT();      // packets while the page image is being sent
      if (s.route === 'pstn') return 1;
      if (s.route === 'g711') return Math.pow(1 - p, n);
      if (s.route === 't38') return Math.pow(1 - Math.pow(p, RED + 1), n);
      return 1;
    };
    return {
      update(dt, s) {
        dt = Math.max(0, dt); t += dt; st = s;
        const narrow = fitNarrow(stage, [L.gw, L.ex, L.cloud], -0.1);
        const top = narrow || inReel(); cm.position.set(top ? 0 : 2.85, top ? 4.2 : 1.95, top ? -1.6 : -0.6); cm.rotation.y = top ? 0 : -0.3; root.position.x = top ? 0 : -1.0; cm.visible = !narrow || inReel();
        for (const k in lines) lines[k].material.opacity = 0.08;
        lines[s.route].material.opacity = 0.5;
        const ip = s.route !== 'pstn';
        gwL.visible = gwR.visible = ip; cloud.visible = ip; exch.visible = !ip; L.ex.visible = !ip && !narrow; L.gw.visible = ip && !narrow; L.cloud.visible = ip && !narrow;
        laptop.visible = s.route === 'email'; L.lap.visible = s.route === 'email'; B.group.visible = s.route !== 'email'; L.b.visible = s.route !== 'email';
        gwR.visible = ip && s.route !== 'email';
        const cv = curves[s.route], p = s.loss / 100;
        pk.forEach((q, i) => {
          const u = (t * 0.12 + i / NP) % 1, lap = Math.floor(t * 0.12 + i / NP);
          if (lap !== q.seen) { q.seen = lap; q.lost = ip && s.route !== "email" && hash(i * 131 + lap * 7) < p * 6; q.drop = 0; }   // the drawn packets stand for many; losses are shown 6× more often so you can see them
          const inNet = u > 0.3 && u < 0.7;
          const pos = cv.getPointAt(u);
          if (q.lost && u > 0.5) { q.drop += dt; pos.y -= q.drop * 2.5; }
          q.m.position.copy(pos);
          q.m.visible = !(q.lost && q.drop > 0.6);
          q.m.material.color.setHex(s.route === 'pstn' ? 0xffb547 : q.lost && u > 0.45 ? 0xff5a8a : s.route === 't38' ? 0x5ce1a9 : 0x8ef0ff);
          q.m.scale.setScalar(s.route === 'pstn' ? 0.55 : s.route === 't38' && inNet ? 1.25 : 1);
        });
      },
      readout(s) {
        const o = odds(s), r = ROUTES[s.route], T = callPlan('v29', pageT(), 1).total;
        const pct = o > 0.995 ? '> 99%' : `${(o * 100).toFixed(o < 0.1 ? 1 : 0)}%`;
        return `<div class="big">${pct} of pages get through</div>
          <div class="row"><span>Route</span><b>${r.name}</b></div>
          <div class="row"><span>One-page call at 9,600 bit/s</span><b>${T.toFixed(0)} s</b></div>
          <div class="row"><span>Packets while the page is sent (20 ms each)</span><b>${Math.round(PPS * pageT()).toLocaleString('en')}</b></div>
          <div class="row"><span>Packet loss</span><b>${s.loss.toFixed(2)}%</b></div>
          <small>${r.note}${s.route === 't38' ? ` A page is hurt only if ${RED + 1} packets in a row are lost.` : ''} Simple model: losses at random, no ECM.</small>`;
      },
    };
  },
};
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
