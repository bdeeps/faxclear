// Chapter 1: inside a desktop fax. A scanner, a printer and a modem sharing one box and one phone line.
// Two paper paths: the page you send runs over a contact image sensor (CIS) bar; the page you receive
// comes off a roll of thermal paper under a print head. Parts are drawn larger than life where needed.
import { THREE, M, clamp, exploder, canvasTexture } from '../kit.js';
import { makeFax, ribbon, paintPage, fitNarrow, PELS, LINE_MM, MODEMS } from '../fax.js';

const MODES = {
  send: { name: 'Sending', what: 'The page slides over the scanner bar, one line at a time. The modem turns the lines into sound for the phone line.' },
  receive: { name: 'Receiving', what: 'Sound comes in on the phone line, the modem turns it back into lines, and the print head burns each line onto heat-sensitive paper.' },
  copy: { name: 'Copying', what: 'Scanner straight to printer, no phone call. Every fax machine is also a small copier.' },
};

export default {
  id: 'anatomy',
  short: 'Inside a fax',
  title: 'Inside a fax machine',
  subtitle: 'A scanner, a printer and a modem, sharing one box and one phone line.',
  view: { pos: [4.5, 2.5, 1.3], target: [-0.1, 1.15, -0.3] },
  learn: `<p>A fax machine is three machines in one box. A <b>scanner</b> reads your page as dots. A <b>modem</b> turns the dots into sounds that can travel down an ordinary <b>phone line</b>. And a <b>printer</b> at the other end turns the sounds back into dots on paper.</p>
    <p>The page you send goes in at the back. Rubber <b>feed rollers</b> pull it past a <b>contact image sensor</b> (CIS): a bar as wide as the page with a strip of LEDs, tiny rod lenses, and a row of light sensors. Each moment, it sees one thin line across the paper. The cameras in CameraClear use the same kind of sensors, just in a grid instead of a line.</p>
    <p>The page you receive comes off a roll of <b>thermal paper</b>. A <b>thermal print head</b> with a row of tiny heaters presses it against a rubber <b>platen roller</b>. Wherever a heater warms up, the paper turns black. No ink at all.</p>
    <p>The <b>modem and controller</b> board does the thinking, a <b>stepper motor</b> moves the paper in exact small steps, and a small <b>speaker</b> lets you hear the call. The whole machine plugs into the same phone socket as a telephone.</p>
    <p class="tip"><b>Try it:</b> pull the parts apart with X-ray on, then switch between sending, receiving and copying to see which paper path moves.</p>`,
  terms: [
    { t: 'Contact image sensor (CIS)', d: 'A page-wide bar of LEDs, lenses and light sensors that reads one line of a page at a time.' },
    { t: 'Thermal print head', d: 'A row of tiny heaters, one for every dot across the page.' },
    { t: 'Thermal paper', d: 'Paper coated with chemicals that turn black when heated.' },
    { t: 'Platen roller', d: 'The rubber roller that presses the paper against the print head.' },
    { t: 'Modem', d: 'Modulator-demodulator: turns bits into sounds and sounds back into bits.' },
    { t: 'Stepper motor', d: 'A motor that turns in exact small steps, so the paper moves one line at a time.' },
  ],
  defaults: { explode: 0.45, xray: true, mode: 'send' },
  controls: [
    { key: 'explode', type: 'range', label: 'Take it apart', min: 0, max: 1, step: 0.01, ends: ['together', 'exploded'], fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'xray', type: 'toggle', label: 'X-ray the case' },
    { key: 'mode', type: 'seg', label: 'What is it doing?', options: Object.entries(MODES).map(([v, m]) => ({ v, label: m.name })) },
  ],
  quiz: [
    { q: 'Which part reads the page you send?', options: ['The thermal print head', 'The contact image sensor bar', 'The modem', 'The platen roller'], answer: 1, why: 'The CIS bar lights one thin line of the page and measures how much light each spot reflects.' },
    { q: 'How does a thermal fax print without ink?', options: ['It burns holes in the paper', 'Heaters darken special heat-sensitive paper', 'It uses a hidden ink ribbon', 'Static electricity pulls dust onto the paper'], answer: 1, why: 'The paper is coated with chemicals that turn black when a heater dot warms them.' },
    { q: 'What does the modem do?', options: ['Cuts the paper', 'Turns bits into sounds for the phone line, and back', 'Stores the pages', 'Cools the print head'], answer: 1, why: 'A phone line carries sound, so the bits have to travel as tones.' },
  ],
  reel: [
    { ms: 5200, caption: 'A fax machine is a scanner, a printer and a modem sharing one phone line.', set: { xray: true, mode: 'send' }, anim: { explode: [0, 0.75] }, spin: 0.35, view: { pos: [3.3, 2.7, 2.3], target: [0, 1.15, -0.2] } },
  ],

  build({ stage }) {
    const root = new THREE.Group(); stage.root.add(root);
    const fax = makeFax(); root.add(fax.group);
    const P = fax.P;

    // The two paper paths as moving paper
    const docTex = canvasTexture(420, 594, (g, w, h) => paintPage(g, w, h, 'note')); docTex.tex.wrapT = THREE.RepeatWrapping;
    const rxTex = canvasTexture(420, 594, (g, w, h) => paintPage(g, w, h, 'map')); rxTex.tex.wrapT = THREE.RepeatWrapping;
    const paper = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.8, side: THREE.DoubleSide });
    const sendG = new THREE.Group(); root.add(sendG);
    const doc = ribbon(P.docPath, 2.1, paper(docTex.tex)); sendG.add(doc);
    fax.group.remove(P.tray); fax.group.remove(P.rollers); sendG.add(P.tray, P.rollers);
    const rxG = new THREE.Group(); root.add(rxG);
    const rx = ribbon(P.rxPath, 2.1, paper(rxTex.tex)); rxG.add(rx);
    docTex.tex.repeat.set(1, 0.9); rxTex.tex.repeat.set(1, 0.7);

    // Phone cord to a wall socket behind
    const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[1.1, 0.32, -1.24], [1.2, 0.1, -1.7], [1.6, 0.05, -2.2], [2.2, 0.3, -2.55]].map((p) => new THREE.Vector3(...p))), 40, 0.025, 8), M.plastic(0xe8e6de));
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.06), M.plastic(0xf2f0ea)); wall.position.set(2.2, 0.35, -2.6);
    P.jack.add(cord); cord.position.set(-1.1, -0.32, 1.2); root.add(wall);

    const ex = exploder([
      { obj: P.cover, off: [0, 1.5, 0] }, { obj: P.panel, off: [0.2, 1.75, 0.9] }, { obj: P.handset, off: [-0.9, 0.9, 0.3] },
      { obj: sendG, off: [0, 0.95, 0] }, { obj: P.cis, off: [0, 0.5, 0] }, { obj: P.head, off: [0, 0.3, 0.1] },
      { obj: P.board, off: [0.9, -0.05, -1.3] }, { obj: P.psu, off: [-1.1, -0.05, 0.2] }, { obj: P.jack, off: [0.5, 0, -0.5] },
      { obj: P.motor, off: [0.8, 0, 0] }, { obj: P.speaker, off: [0, 0, 0.9] },
    ]);

    const L = (t, p, parent = root, cls = '') => stage.label(t, p, parent, cls);
    const labels = {
      tray: L('Document feeder', [0, 1.75, -1.95], P.tray),
      cis: L('CIS scanner bar', [-1.25, 0.05, 0], P.cis, 'hot'),
      rollers: L('Feed rollers', [1.2, 0.95, -0.35], P.rollers),
      head: L('Thermal print head', [1.25, 0.05, 0], P.head, 'hot'),
      platen: L('Platen roller', [-1.35, 0.37, 0.55]),
      roll: L('Thermal paper roll', [-1.3, 0.1, 0], P.roll),
      board: L('Modem + controller', [0, 0.12, 0.45], P.board, 'hot'),
      psu: L('Power supply', [0, 0.25, 0.35], P.psu),
      jack: L('Phone line jack', [0, 0.14, 0], P.jack),
      panel: L('Keypad and display', [-0.5, 0.25, -0.1], P.panel),
      motor: L('Stepper motor', [0, 0.22, 0], P.motor),
      speaker: L('Speaker', [0, 0.1, 0], P.speaker),
    };
    const minor = [labels.platen, labels.psu, labels.motor, labels.speaker, labels.panel, labels.rollers];

    let t = 0, lcdKey = '';
    return {
      update(dt, s) {
        dt = Math.max(0, dt); t += dt;
        const narrow = fitNarrow(stage, []);
        minor.forEach((l) => { l.visible = !narrow && s.explode > 0.7; });
        ex(s.explode);
        fax.shellMat.opacity = s.xray ? 0.16 : 1; fax.shellMat.depthWrite = !s.xray;
        [labels.board, labels.psu, labels.cis, labels.head, labels.roll, labels.motor, labels.speaker].forEach((l) => { l.element.style.opacity = s.xray || s.explode > 0.3 ? 1 : 0.35; });
        const sending = s.mode !== 'receive', receiving = s.mode !== 'send';
        // Scanning: about 5 mm/s of paper in this model's time (a real standard-mode page takes about 10–20 s).
        if (sending) docTex.tex.offset.y = (docTex.tex.offset.y + dt * 0.05) % 1;
        if (receiving) rxTex.tex.offset.y = (rxTex.tex.offset.y + dt * 0.05) % 1;
        P.cisGlow.material.color.setHex(sending ? 0x9dffcb : 0x1c3a2c);
        P.headLine.material.color.setRGB(receiving ? 1 : 0.2, receiving ? 0.35 + 0.25 * Math.abs(Math.sin(t * 23)) : 0.08, receiving ? 0.1 : 0.05);
        P.rollers.children.forEach((r) => { if (sending) r.rotation.x -= dt * 2; });
        P.platen.rotation.x -= receiving ? dt * 2 : 0;
        P.roll.rotation.x -= receiving ? dt * 0.8 : 0;
        const key = s.mode;
        if (key !== lcdKey) { lcdKey = key; P.lcd.redraw(s.mode === 'send' ? 'SENDING  P.01' : s.mode === 'receive' ? 'RECEIVING P.01' : 'COPYING', 'FINE  204x196'); }
      },
      readout(s) {
        const m = MODES[s.mode];
        return `<div class="big">${m.name}</div>
          <div class="row"><span>Scanner and print head</span><b>${PELS.toLocaleString('en')} dots across</b></div>
          <div class="row"><span>Dots per mm</span><b>${(PELS / LINE_MM).toFixed(2)} (≈ 204 per inch)</b></div>
          <div class="row"><span>Fastest common modem</span><b>${MODEMS.v17.rate.toLocaleString('en')} bit/s</b></div>
          <div class="row"><span>A phone line carries</span><b>about 300–3,400 Hz</b></div>
          <small>${m.what}</small>`;
      },
    };
  },
};
