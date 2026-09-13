import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

gsap.registerPlugin(ScrollTrigger);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============================================================
   Helpers
   ============================================================ */
const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const map = (v, a, b, c, d) => c + ((clamp((v - a) / (b - a)) ) * (d - c));
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function createScreenTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1040;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#0d1a26');
  grad.addColorStop(1, '#03050a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(94, 231, 255, 0.95)';
  ctx.font = '600 46px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('9:41', canvas.width / 2, 140);

  const cols = 4, rows = 5, pad = 56, gap = 22;
  const cell = (canvas.width - pad * 2 - gap * (cols - 1)) / cols;
  const colors = ['#5ee7ff', '#ff7a45', '#8b7bff', '#4dd6a1', '#ffd166', '#ff5e9e'];
  let ci = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = pad + c * (cell + gap);
      const y = 250 + r * (cell + gap);
      ctx.fillStyle = colors[ci % colors.length];
      roundRectPath(ctx, x, y, cell, cell, cell * 0.26);
      ctx.fill();
      ci++;
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ============================================================
   Phone factory (shared by main scene + camera mini-scene)
   ============================================================ */
const PHONE = { leafW: 0.95, h: 2.3, depth: 0.085, radius: 0.16, hingeGap: 0.1 };

function buildCameraModule(scale = 1) {
  const camGroup = new THREE.Group();
  const plateGeo = new RoundedBoxGeometry(0.62 * scale, 0.62 * scale, 0.05 * scale, 4, 0.16 * scale);
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.85, roughness: 0.32 });
  const plate = new THREE.Mesh(plateGeo, plateMat);
  camGroup.add(plate);

  const ringMat = new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 1, roughness: 0.25 });
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0x14202b, metalness: 0.1, roughness: 0.05,
    transmission: 0.55, ior: 1.6, clearcoat: 1, envMapIntensity: 1.4
  });
  const lensPositions = [[-0.16, 0.16], [0.16, 0.16], [0, -0.17]];
  lensPositions.forEach(([lx, ly]) => {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.135 * scale, 0.135 * scale, 0.035 * scale, 32), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(lx * scale, ly * scale, -0.03 * scale);
    camGroup.add(ring);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.105 * scale, 0.105 * scale, 0.05 * scale, 32), lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(lx * scale, ly * scale, -0.045 * scale);
    camGroup.add(lens);
  });
  const flash = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 0.02 * scale, 20),
    new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xfff3d6, emissiveIntensity: 0.2, roughness: 0.4 })
  );
  flash.rotation.x = Math.PI / 2;
  flash.position.set(0.19 * scale, -0.19 * scale, -0.02 * scale);
  camGroup.add(flash);

  camGroup.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return camGroup;
}

function buildPhone() {
  const group = new THREE.Group();
  const parts = {};
  const screenTex = createScreenTexture();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xb7bac1, metalness: 1, roughness: 0.32, envMapIntensity: 1.3 });
  const backMat = new THREE.MeshPhysicalMaterial({ color: 0x12151b, metalness: 0.35, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 1.2 });

  function buildLeaf(sign, key) {
    // sign: +1 = right leaf, -1 = left leaf. Each leaf pivots around the hinge line.
    const pivot = new THREE.Group();
    pivot.position.x = sign * (PHONE.hingeGap / 2);
    group.add(pivot);

    const bodyW = PHONE.leafW - 0.04;
    const outX = sign * (PHONE.leafW / 2);

    const body = new THREE.Mesh(new RoundedBoxGeometry(bodyW, PHONE.h, PHONE.depth, 4, PHONE.radius), bodyMat);
    body.position.set(outX, 0, 0);
    body.userData.partKey = 'frame';
    pivot.add(body);
    parts[key + 'Frame'] = { mesh: body, rest: body.position.clone(), explode: body.position.clone().add(new THREE.Vector3(0, 0, 0.1 * sign)), labelKey: 'frame' };

    const back = new THREE.Mesh(new RoundedBoxGeometry(bodyW - 0.02, PHONE.h - 0.02, 0.02, 4, PHONE.radius * 0.9), backMat);
    back.position.set(outX, 0, -PHONE.depth / 2 - 0.011);
    back.userData.partKey = 'frame';
    pivot.add(back);
    parts[key + 'Back'] = { mesh: back, rest: back.position.clone(), explode: back.position.clone().add(new THREE.Vector3(0, 0, -1.6)), labelKey: 'frame' };

    const screenMat = new THREE.MeshStandardMaterial({ map: screenTex, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0.6, roughness: 0.5 });
    const screen = new THREE.Mesh(new RoundedBoxGeometry(bodyW - 0.05, PHONE.h - 0.05, 0.015, 4, PHONE.radius * 0.8), screenMat);
    screen.position.set(outX, 0, PHONE.depth / 2 + 0.008);
    screen.userData.partKey = 'display';
    pivot.add(screen);
    parts[key + 'Screen'] = { mesh: screen, rest: screen.position.clone(), explode: screen.position.clone().add(new THREE.Vector3(0, 0, 1.7)), labelKey: 'display' };

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(bodyW * 0.55, PHONE.h * 0.5, 0.025),
      new THREE.MeshStandardMaterial({ color: 0x0c3d2c, metalness: 0.35, roughness: 0.6 })
    );
    board.position.set(outX, PHONE.h * 0.18, 0);
    board.userData.partKey = 'board';
    pivot.add(board);
    parts[key + 'Board'] = { mesh: board, rest: board.position.clone(), explode: board.position.clone().add(new THREE.Vector3(sign * 1.1, -0.2, -1.4)), labelKey: 'board' };

    const battery = new THREE.Mesh(
      new RoundedBoxGeometry(bodyW * 0.62, PHONE.h * 0.36, 0.05, 4, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.3, roughness: 0.5 })
    );
    battery.position.set(outX, -PHONE.h * 0.26, 0);
    battery.userData.partKey = 'battery';
    pivot.add(battery);
    parts[key + 'Battery'] = { mesh: battery, rest: battery.position.clone(), explode: battery.position.clone().add(new THREE.Vector3(sign * 1.2, -0.8, -1.5)), labelKey: 'battery' };

    return pivot;
  }

  const rightPivot = buildLeaf(1, 'right');
  const leftPivot = buildLeaf(-1, 'left');

  // Camera module — outer back of the right leaf, like a conventional phone camera
  const camGroup = buildCameraModule(0.9);
  camGroup.position.set(PHONE.leafW - 0.32, PHONE.h * 0.32, -PHONE.depth / 2 - 0.03);
  camGroup.traverse((o) => { if (o.isMesh) o.userData.partKey = 'camera'; });
  rightPivot.add(camGroup);
  parts.camera = { mesh: camGroup, rest: camGroup.position.clone(), explode: camGroup.position.clone().add(new THREE.Vector3(0.5, 0.6, -1.9)), labelKey: 'camera' };

  // Hinge barrel — fixed at the spine, doesn't rotate with either leaf
  const hinge = new THREE.Mesh(
    new THREE.CylinderGeometry(PHONE.hingeGap * 0.55, PHONE.hingeGap * 0.55, PHONE.h * 0.96, 24),
    new THREE.MeshStandardMaterial({ color: 0x9a9da4, metalness: 1, roughness: 0.28 })
  );
  hinge.userData.partKey = 'hinge';
  group.add(hinge);
  parts.hinge = { mesh: hinge, rest: new THREE.Vector3(0, 0, 0), explode: new THREE.Vector3(0, -0.3, 1.2), labelKey: 'hinge' };

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const partsByCategory = {};
  Object.values(parts).forEach((part) => {
    const cat = part.labelKey;
    if (!partsByCategory[cat]) partsByCategory[cat] = [];
    partsByCategory[cat].push(part);
  });

  return { group, parts, partsByCategory, rightPivot, leftPivot };
}

/* ============================================================
   Drag-rotate helper (real pointer interaction)
   ============================================================ */
function attachDragRotate(dom, target, opts = {}) {
  const state = { dragging: false, px: 0, py: 0, velX: 0, velY: 0 };
  const sensitivity = opts.sensitivity ?? 0.008;
  const damping = opts.damping ?? 0.94;

  dom.addEventListener('pointerdown', (e) => {
    state.dragging = true;
    state.px = e.clientX;
    state.py = e.clientY;
    dom.classList.add('dragging');
    dom.setPointerCapture(e.pointerId);
  });
  dom.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    const dx = e.clientX - state.px;
    const dy = e.clientY - state.py;
    state.px = e.clientX;
    state.py = e.clientY;
    state.velX = dx * sensitivity;
    state.velY = dy * sensitivity;
    target.offset.y += state.velX;
    target.offset.x = clamp(target.offset.x + state.velY, -0.6, 0.6);
    if (opts.onDrag) opts.onDrag();
  });
  const release = (e) => {
    state.dragging = false;
    dom.classList.remove('dragging');
    if (e && dom.releasePointerCapture && e.pointerId != null) {
      try { dom.releasePointerCapture(e.pointerId); } catch (err) {}
    }
  };
  dom.addEventListener('pointerup', release);
  dom.addEventListener('pointerleave', release);

  function tick() {
    if (!state.dragging) {
      if (!reduceMotion) {
        target.offset.y += state.velX;
        target.offset.x = clamp(target.offset.x + state.velY, -0.6, 0.6);
      }
      state.velX *= damping;
      state.velY *= damping;
    }
  }
  return { state, tick };
}

/* ============================================================
   MAIN SCENE — hero / 360 / explode
   ============================================================ */
const stage = document.querySelector('.stage');
const mainCanvas = document.getElementById('webgl-main');

const renderer = new THREE.WebGLRenderer({ canvas: mainCanvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x08090b, 8, 16);

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
camera.position.set(0, 0.15, 5.1);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// Lighting — cinematic three point
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(3.2, 4, 3.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 12;
keyLight.shadow.camera.left = -3;
keyLight.shadow.camera.right = 3;
keyLight.shadow.camera.top = 3;
keyLight.shadow.camera.bottom = -3;
keyLight.shadow.bias = -0.0015;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x8fb4ff, 0.6);
fillLight.position.set(-3, 1.5, 2);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x5ee7ff, 3.2, 10, 2);
rimLight.position.set(-1.6, 1.2, -2.4);
scene.add(rimLight);

const rimLight2 = new THREE.PointLight(0xd98a4b, 1.8, 10, 2);
rimLight2.position.set(1.6, -1.6, -2.2);
scene.add(rimLight2);

scene.add(new THREE.HemisphereLight(0x8899aa, 0x0a0a0c, 0.35));

// Ground contact shadow
const groundGeo = new THREE.PlaneGeometry(20, 20);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.35 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.75;
ground.receiveShadow = true;
scene.add(ground);

// Phone
const HERO_THETA = 0.92; // ~53°, the ajar "hero" fold angle
const { group: phoneGroup, parts, partsByCategory, rightPivot, leftPivot } = buildPhone();
phoneGroup.rotation.x = 0.05;
rightPivot.rotation.y = -HERO_THETA / 2;
leftPivot.rotation.y = HERO_THETA / 2;
scene.add(phoneGroup);

const rotationOffset = { x: 0, y: 0 };
const dragCtrl = attachDragRotate(mainCanvas, { offset: rotationOffset });

function resizeMain() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resizeMain();
window.addEventListener('resize', resizeMain);

/* ---------- Scroll timeline ---------- */
const timeline = { p: 0 };
ScrollTrigger.create({
  trigger: '#experience',
  start: 'top top',
  end: 'bottom bottom',
  scrub: 0.7,
  onUpdate: (self) => { timeline.p = self.progress; }
});

const heroEl = document.querySelector('.phase-hero');
const showcaseEl = document.querySelector('.phase-showcase');
const explodeEl = document.querySelector('.phase-explode');

/* ---------- Labels ---------- */
const LABEL_DATA = [
  { key: 'display', title: 'Foldable display', desc: '5.5" outer · 7.8" inner, both ProMotion', accent: '#5ee7ff' },
  { key: 'frame', title: 'Titanium shell', desc: 'Grade 5 titanium, dual-leaf construction', accent: '#c7cad0' },
  { key: 'hinge', title: 'Precision hinge', desc: 'Sealed mechanism, 100+ components', accent: '#7d8590' },
  { key: 'camera', title: 'Camera module', desc: 'Triple 48MP, sensor-shift OIS', accent: '#8b7bff' },
  { key: 'board', title: 'Dual logic boards', desc: 'Custom 3nm chip, split across both leaves', accent: '#4dd6a1' },
  { key: 'battery', title: 'Dual battery cells', desc: 'Twin silicon-carbon cells', accent: '#d98a4b' }
];
const labelsRoot = document.getElementById('labels-root');
const labelEls = {};
LABEL_DATA.forEach((d) => {
  const el = document.createElement('div');
  el.className = 'label-point';
  el.style.setProperty('--accent', d.accent);
  el.innerHTML = `<span class="dot"></span><span class="txt"><b>${d.title}</b><small>${d.desc}</small></span>`;
  labelsRoot.appendChild(el);
  labelEls[d.key] = el;
});

function getCategoryWorldPosition(cat, out) {
  const list = partsByCategory[cat];
  if (!list || !list.length) return null;
  const tmp = new THREE.Vector3();
  out.set(0, 0, 0);
  list.forEach((part) => { part.mesh.getWorldPosition(tmp); out.add(tmp); });
  out.multiplyScalar(1 / list.length);
  return out;
}

const projectVec = new THREE.Vector3();
function updateLabel(key, worldPos, opacity) {
  const el = labelEls[key];
  if (!el) return;
  if (opacity <= 0.02) { el.style.opacity = 0; return; }
  projectVec.copy(worldPos).project(camera);
  const rect = stage.getBoundingClientRect();
  const x = (projectVec.x * 0.5 + 0.5) * rect.width;
  const y = (-projectVec.y * 0.5 + 0.5) * rect.height;
  el.style.opacity = opacity;
  el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
}

/* ---------- Raycast hover / click focus ---------- */
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const hoverTip = document.getElementById('hover-tip');
let hoveredKey = null;
let focusedKey = null;
let lastPointer = { x: 0, y: 0 };

const cameraLook = new THREE.Vector3(0, 0.1, 0);
const focusTarget = { active: false, pos: new THREE.Vector3(), look: new THREE.Vector3() };
const focusWp = new THREE.Vector3();

const interactiveMeshes = [];
phoneGroup.traverse((o) => { if (o.isMesh && o.userData.partKey) interactiveMeshes.push(o); });

function labelFor(key) {
  return LABEL_DATA.find((d) => d.key === key);
}

mainCanvas.addEventListener('pointermove', (e) => {
  const rect = mainCanvas.getBoundingClientRect();
  pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  lastPointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
});

mainCanvas.addEventListener('click', (e) => {
  if (dragCtrl.state.dragging) return;
  if (explodeProgressCache < 0.5) return;
  if (hoveredKey) {
    focusedKey = focusedKey === hoveredKey ? null : hoveredKey;
  } else {
    focusedKey = null;
  }
});

let explodeProgressCache = 0;

/* ---------- Animation loop ---------- */
const clock = new THREE.Clock();

function animateMain() {
  const t = clock.getElapsedTime();
  dragCtrl.tick();

  const p = timeline.p;
  const foldCloseP = smoothstep(0.16, 0.32, p); // 0 = ajar (hero), 1 = fully open flat
  const spinP = smoothstep(0.3, 0.46, p); // 360° turn once the device is open
  const explodeP = smoothstep(0.5, 0.86, p);
  explodeProgressCache = explodeP;

  // Phase panel opacity
  const heroOp = 1 - smoothstep(0.02, 0.2, p);
  const showOp = smoothstep(0.14, 0.26, p) * (1 - smoothstep(0.44, 0.54, p));
  const expOp = smoothstep(0.52, 0.62, p);
  heroEl.style.opacity = heroOp;
  showcaseEl.style.opacity = showOp;
  explodeEl.style.opacity = expOp;
  heroEl.style.pointerEvents = heroOp > 0.4 ? 'auto' : 'none';

  // Fold: both leaves swing open around the hinge as the user scrolls
  const theta = HERO_THETA * (1 - foldCloseP);
  rightPivot.rotation.y = -theta / 2;
  leftPivot.rotation.y = theta / 2;

  // Rotation: scroll-driven turn (after unfolding) + manual drag offset
  const idle = reduceMotion ? 0 : Math.sin(t * 0.4) * 0.03 * (1 - spinP);
  phoneGroup.rotation.y = spinP * Math.PI * 2 + rotationOffset.y + idle;
  phoneGroup.rotation.x = 0.05 + rotationOffset.x;

  // Explode parts
  Object.values(parts).forEach((part) => {
    part.mesh.position.lerpVectors(part.rest, part.explode, explodeP);
  });

  // Camera dolly
  let camZ = 5.1 + foldCloseP * 0.5 - spinP * 0.6;
  camZ += explodeP * 2.3;
  camera.position.z = camZ;
  camera.position.y = 0.15 - explodeP * 0.05;
  camera.position.x = 0;

  // Click-to-focus camera nudge
  if (focusedKey) {
    const wp = getCategoryWorldPosition(focusedKey, focusWp);
    if (wp) {
      focusTarget.pos.set(wp.x * 0.5, wp.y * 0.5 + 0.1, camZ - 1.1);
      focusTarget.look.copy(wp);
      camera.position.lerp(focusTarget.pos, 0.06);
      cameraLook.lerp(focusTarget.look, 0.08);
    }
  } else {
    cameraLook.lerp(new THREE.Vector3(0, 0.1, 0), 0.08);
  }
  camera.lookAt(cameraLook);

  // Raycast hover (only meaningful once parts are separated)
  if (explodeP > 0.35 && !dragCtrl.state.dragging) {
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(interactiveMeshes, false);
    const key = hits.length ? hits[0].object.userData.partKey : null;
    if (key !== hoveredKey) {
      hoveredKey = key;
      mainCanvas.style.cursor = key ? 'pointer' : 'grab';
    }
    if (hoveredKey) {
      const d = labelFor(hoveredKey);
      hoverTip.textContent = d ? `${d.title} — click to focus` : '';
      hoverTip.style.opacity = 1;
      hoverTip.style.transform = `translate(-50%, -140%) translate(${lastPointer.x}px, ${lastPointer.y}px)`;
    } else {
      hoverTip.style.opacity = 0;
    }
  } else {
    hoverTip.style.opacity = 0;
    if (hoveredKey) { hoveredKey = null; mainCanvas.style.cursor = 'grab'; }
  }

  // Update labels
  const wp2 = new THREE.Vector3();
  LABEL_DATA.forEach((d) => {
    const pos = getCategoryWorldPosition(d.key, wp2);
    if (!pos) return;
    const isFocused = focusedKey === d.key;
    updateLabel(d.key, pos, expOp * (focusedKey && !isFocused ? 0.35 : 1));
  });

  renderer.render(scene, camera);
  requestAnimationFrame(animateMain);
}
requestAnimationFrame(animateMain);

/* ============================================================
   MINI SCENE — camera module viewer
   ============================================================ */
const camSection = document.getElementById('camera');
const camCanvas = document.getElementById('webgl-camera');

if (camCanvas) {
  const miniRenderer = new THREE.WebGLRenderer({ canvas: camCanvas, antialias: true, alpha: true });
  miniRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  miniRenderer.outputColorSpace = THREE.SRGBColorSpace;
  miniRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  miniRenderer.shadowMap.enabled = true;
  miniRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const miniScene = new THREE.Scene();
  const miniCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  miniCamera.position.set(0, 0.2, 3.4);

  const miniPmrem = new THREE.PMREMGenerator(miniRenderer);
  miniScene.environment = miniPmrem.fromScene(new RoomEnvironment(), 0.06).texture;

  const miniKey = new THREE.DirectionalLight(0xffffff, 2.2);
  miniKey.position.set(2, 3, 3);
  miniKey.castShadow = true;
  miniScene.add(miniKey);
  const miniRim = new THREE.PointLight(0x5ee7ff, 2.4, 8, 2);
  miniRim.position.set(-1.4, 0.6, -1.6);
  miniScene.add(miniRim);
  miniScene.add(new THREE.HemisphereLight(0x8899aa, 0x0a0a0c, 0.4));

  const miniModule = buildCameraModule(2.6);
  miniModule.rotation.x = 0.1;
  miniScene.add(miniModule);

  const miniOffset = { x: 0.1, y: 0.6 };
  const miniDrag = attachDragRotate(camCanvas, { offset: miniOffset }, { sensitivity: 0.01 });

  function resizeMini() {
    const rect = camCanvas.getBoundingClientRect();
    const size = Math.max(rect.width, 1);
    miniRenderer.setSize(size, size, false);
    miniCamera.aspect = 1;
    miniCamera.updateProjectionMatrix();
  }
  resizeMini();
  window.addEventListener('resize', resizeMini);

  function animateMini() {
    miniDrag.tick();
    miniModule.rotation.y = miniOffset.y;
    miniModule.rotation.x = clamp(miniOffset.x, -0.5, 0.6);
    miniRenderer.render(miniScene, miniCamera);
    requestAnimationFrame(animateMini);
  }
  requestAnimationFrame(animateMini);
}

/* ============================================================
   Smooth-scroll nav links
   ============================================================ */
document.querySelectorAll('[data-scroll]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('#')) return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });
});

/* ============================================================
   Performance counters + bars
   ============================================================ */
document.querySelectorAll('.stat-value').forEach((el) => {
  const target = parseFloat(el.dataset.count);
  const suffix = el.dataset.suffix || '';
  const obj = { val: 0 };
  ScrollTrigger.create({
    trigger: el,
    start: 'top 85%',
    once: true,
    onEnter: () => {
      gsap.to(obj, {
        val: target,
        duration: reduceMotion ? 0.3 : 1.6,
        ease: 'power2.out',
        onUpdate: () => { el.textContent = Math.round(obj.val) + suffix; }
      });
    }
  });
});

document.querySelectorAll('.bar-fill').forEach((el) => {
  ScrollTrigger.create({
    trigger: el,
    start: 'top 90%',
    once: true,
    onEnter: () => { el.style.width = el.dataset.target + '%'; }
  });
});

/* ============================================================
   Battery fill tied to scroll
   ============================================================ */
const batteryFill = document.getElementById('battery-fill');
const batteryPercent = document.getElementById('battery-percent');
if (batteryFill) {
  ScrollTrigger.create({
    trigger: '#battery',
    start: 'top 75%',
    end: 'bottom 55%',
    scrub: 0.5,
    onUpdate: (self) => {
      const pct = Math.round(self.progress * 100);
      batteryFill.style.height = pct + '%';
      batteryPercent.textContent = pct;
    }
  });
}

/* ============================================================
   Section entrance (single restrained fade per heading)
   ============================================================ */
gsap.utils.toArray('.section-title, .cta-title').forEach((el) => {
  gsap.fromTo(el, { autoAlpha: 0, y: reduceMotion ? 0 : 24 }, {
    autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out',
    scrollTrigger: { trigger: el, start: 'top 85%', once: true }
  });
});

/* ============================================================
   Notify modal — real client-side interaction, no backend
   ============================================================ */
const modal = document.getElementById('notify-modal');
const openBtn = document.getElementById('notify-open');
const closeBtn = document.getElementById('notify-close');
const form = document.getElementById('notify-form');
const emailInput = document.getElementById('notify-email');
const status = document.getElementById('notify-status');

function openModal() {
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => emailInput.focus(), 100);
}
function closeModal() {
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  status.textContent = '';
  status.classList.remove('is-error');
  form.reset();
}
openBtn.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal(); });

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = emailInput.value.trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (!valid) {
    status.textContent = 'That email doesn\'t look right — check it and try again.';
    status.classList.add('is-error');
    emailInput.focus();
    return;
  }
  status.classList.remove('is-error');
  status.textContent = `You're on the list, ${value}. We'll be in touch.`;
  emailInput.value = '';
});

/* ============================================================
   Loader
   ============================================================ */
window.addEventListener('load', () => {
  setTimeout(() => document.getElementById('loader').classList.add('is-hidden'), 400);
});
ScrollTrigger.refresh();