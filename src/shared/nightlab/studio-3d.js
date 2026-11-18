import * as THREE from './vendor/three/three.module.js';
import { OrbitControls } from './vendor/three/OrbitControls.js';
import { STLLoader } from './vendor/three/STLLoader.js';
import { createBlink1Model } from './light-model.js';

// This viewer changes the camera and object pose, never the authored light request.
function init() {
  const stage = document.querySelector('[data-light-stage]');
  const theatre = stage?.querySelector('.stage-theatre');
  if (!theatre) return;
  theatre.removeAttribute('aria-hidden');
  // The same lightweight two-face preview is directly reviewable; no WebGL
  // context or device access is needed for this presentation mode.
  if (new URLSearchParams(location.search).get('view') === 'faces') {
    stage.dataset.threeState = 'static';
    return;
  }
  stage.dataset.threeState = 'loading';
  stage.dataset.viewMotion = 'idle';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.createElement('canvas');
  canvas.dataset.lightCanvas = '';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  const tools = document.createElement('div');
  tools.className = 'stage-view-tools';
  tools.setAttribute('role', 'group');
  const zoomTools = document.createElement('div'); zoomTools.className = 'stage-zoom-tools'; zoomTools.setAttribute('role', 'group');
  const zoomScale = document.createElement('output'); zoomScale.dataset.viewScale = ''; zoomScale.setAttribute('aria-live', 'off'); zoomScale.textContent = '100%';
  const hint = document.createElement('p'); hint.className = 'stage-view-hint';
  hint.dataset.typeRole = 'caption';
  const modelNotes = document.createElement('a'); modelNotes.className = 'stage-model-notes'; modelNotes.href = new URL('./model-reference.html', import.meta.url).href;
  (stage.querySelector('.stage-footer') || stage).append(modelNotes);
  const actions = ['left', 'right', 'flip', 'rock', 'reset', 'zoom-out', 'zoom-in'];
  const icons = {
    left: '<path d="M9 5 4 10l5 5M4 10h9a6 6 0 0 1 0 12" transform="translate(2 -2) scale(.85)"/>',
    right: '<path d="m15 5 5 5-5 5m5-5h-9a6 6 0 0 0 0 12" transform="translate(1 -2) scale(.85)"/>',
    flip: '<path d="M8 5h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M12 3v18M3 9l3-3 3 3m6 6 3 3 3-3"/>',
    rock: '<path d="M3 13c3-8 6 8 9 0s6 8 9 0M7 6h10M9 19h6"/>',
    reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
    'zoom-out': '<path d="M5 12h14"/>',
    'zoom-in': '<path d="M5 12h14M12 5v14"/>',
  };
  const buttons = Object.fromEntries(actions.map(action => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.viewAction = action;
    button.disabled = true;
    button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[action]}</svg>`;
    if (action === 'rock') button.setAttribute('aria-pressed', 'false');
    (action.startsWith('zoom-') ? zoomTools : tools).append(button); return [action, button];
  }));
  zoomTools.insertBefore(zoomScale, buttons['zoom-in']);
  theatre.append(canvas, tools, zoomTools, hint);
  let renderer, controls, model, scene, camera, environment, ground;
  let disposed = false, active = false, visible = true, dirty = true, dragging = false;
  let rocking = false, rockStart = 0, lastTime = 0;
  const restingPosition = new THREE.Vector3();
  const restingRotation = new THREE.Euler();
  const texts = {
    en: { left: '↶', right: '↷', rock: 'Rock', stop: 'Stop motion', reset: 'Reset view', leftLabel: 'Turn left', rightLabel: 'Turn right', zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomGroup: 'Model zoom', zoomLevel: 'Zoom level', canvas: 'Interactive blink(1) mk2 3D model. Drag to rotate; pinch or use plus and minus to zoom. Arrow keys turn; Home resets. Control plus wheel zooms.', hint: 'Drag to turn · pinch or + / − to zoom · Ctrl / ⌘ + scroll', loading: 'Two-face preview · loading 3D', fallback: 'Two-face preview · 3D unavailable', lost: 'Two-face preview · 3D paused', group: '3D view controls', reduced: 'Reduced motion is enabled; use drag or the turn buttons.' },
    'zh-CN': { left: '↶', right: '↷', rock: '轻轻晃动', stop: '停止晃动', reset: '复位', leftLabel: '向左转', rightLabel: '向右转', zoomIn: '放大模型', zoomOut: '缩小模型', zoomGroup: '模型缩放', zoomLevel: '缩放比例', canvas: 'blink(1) mk2 三维模型。拖动旋转，双指捏合或加减按钮缩放，方向键调整，Home 复位，Ctrl 或 Command 加滚轮缩放。', hint: '拖动转角 · 双指或 + / − 缩放 · Ctrl / ⌘ + 滚轮', loading: '双面预览 · 正在加载 3D', fallback: '双面预览 · 当前无法显示 3D', lost: '双面预览 · 3D 已暂停', group: '三维视角控制', reduced: '已启用减少动态效果，可拖动或使用转角按钮。' },
  };
  const text = () => texts[document.documentElement.lang === 'zh-CN' ? 'zh-CN' : 'en'];
  const percentages = Object.fromEntries(['en', 'zh-CN'].map(locale => [locale, new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 })]));
  const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
  const setAttribute = (node, name, value) => { if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
  function updateLabels() {
    const copy = text();
    for (const action of ['left', 'right', 'flip', 'reset']) buttons[action].disabled = stage.dataset.threeState !== 'ready';
    setAttribute(buttons.left, 'aria-label', copy.leftLabel); setAttribute(buttons.right, 'aria-label', copy.rightLabel);
    setAttribute(buttons.left, 'title', copy.leftLabel); setAttribute(buttons.right, 'title', copy.rightLabel);
    const flipLabel = document.documentElement.lang === 'zh-CN' ? '查看另一面' : 'View the opposite face';
    setAttribute(buttons.flip, 'aria-label', flipLabel); setAttribute(buttons.flip, 'title', flipLabel);
    setAttribute(buttons.rock, 'aria-label', rocking ? copy.stop : copy.rock);
    setAttribute(buttons.rock, 'aria-pressed', String(rocking));
    buttons.rock.disabled = motion.matches || stage.dataset.threeState !== 'ready';
    setAttribute(buttons.rock, 'title', motion.matches ? copy.reduced : rocking ? copy.stop : copy.rock);
    setAttribute(buttons.reset, 'aria-label', copy.reset); setAttribute(buttons.reset, 'title', copy.reset);
    setAttribute(buttons['zoom-in'], 'aria-label', copy.zoomIn); setAttribute(buttons['zoom-in'], 'title', copy.zoomIn);
    setAttribute(buttons['zoom-out'], 'aria-label', copy.zoomOut); setAttribute(buttons['zoom-out'], 'title', copy.zoomOut);
    setAttribute(zoomTools, 'aria-label', copy.zoomGroup); setAttribute(zoomScale, 'aria-label', copy.zoomLevel);
    buttons['zoom-in'].disabled = stage.dataset.threeState !== 'ready' || camera?.zoom >= 1.8 - .00001;
    buttons['zoom-out'].disabled = stage.dataset.threeState !== 'ready' || camera?.zoom <= .7 + .00001;
    canvas.tabIndex = stage.dataset.threeState === 'ready' ? 0 : -1;
    setAttribute(canvas, 'aria-hidden', String(stage.dataset.threeState !== 'ready'));
    setAttribute(canvas, 'aria-label', copy.canvas); setAttribute(tools, 'aria-label', copy.group);
    setText(modelNotes, document.documentElement.lang === 'zh-CN' ? '模型与灯号 ↗' : 'Model & LED notes ↗');
    setText(hint, stage.dataset.threeState === 'fallback' ? copy.fallback : stage.dataset.threeState === 'lost' ? copy.lost : stage.dataset.threeState === 'loading' ? copy.loading : document.documentElement.lang === 'zh-CN' ? '拖动旋转 · 双指缩放' : 'Drag · pinch to zoom');
  }
  function fallback() {
    stage.dataset.threeState = 'fallback';
    canvas.hidden = true;
    for (const button of Object.values(buttons)) button.disabled = true;
    updateLabels();
  }
  const localeObserver = new MutationObserver(updateLabels); localeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  updateLabels();
  let gl;
  try { gl = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' }); } catch { /* Static illustration remains usable. */ }
  if (!gl) { fallback(); return; }
  async function setup() {
    renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .9;
    renderer.setClearColor(0xffffff, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    // Broad, low-contrast light keeps the inset matte housing readable without a bright trim.
    const room = new THREE.Scene(); room.background = new THREE.Color(.3, .32, .34);
    const cardPixels = new Uint8Array(128 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const offset = (y * 128 + x) * 4;
      const value = Math.round(255 * (.18 + .82 * Math.sin(Math.PI * x / 127) * Math.sin(Math.PI * y / 63)));
      cardPixels[offset] = cardPixels[offset + 1] = cardPixels[offset + 2] = value; cardPixels[offset + 3] = 255;
    }
    const cardMap = new THREE.DataTexture(cardPixels, 128, 64); cardMap.needsUpdate = true;
    function card(width, height, position, color) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), map: cardMap, side: THREE.DoubleSide }));
      mesh.position.set(...position); mesh.lookAt(0, 0, 0); room.add(mesh);
    }
    card(10, 7, [-3, 7, 5], [1.9, 1.9, 1.9]);
    card(10, 3.5, [2, 3.5, -5], [1.3, 1.35, 1.4]);
    card(3, 8, [-7, 1, -1], [.7, .75, .8]);
    card(8, 5, [7, 1, 3], [.12, .15, .18]);
    const pmrem = new THREE.PMREMGenerator(renderer);
    environment = pmrem.fromScene(room, .04);
    scene.environment = environment.texture;
    room.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); }); cardMap.dispose(); pmrem.dispose();
    scene.environmentIntensity = .75;
    scene.add(new THREE.HemisphereLight(0xfffdf8, 0xc2d0d8, .45));
    const key = new THREE.DirectionalLight(0xfffcf6, 1.15); key.position.set(-3, 7, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -5; key.shadow.camera.right = 5; key.shadow.camera.top = 5; key.shadow.camera.bottom = -5;
    key.shadow.normalBias = .025; key.shadow.bias = -.0001;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xe6f2ff, .45); fill.position.set(4, 2, -4); scene.add(fill);
    const loader = new STLLoader();
    const [diffuserGeometry, frameGeometry] = await Promise.all([
      loader.loadAsync(new URL('./model-assets/blink1mk2_enclosure_diffuser_v3k.stl', import.meta.url).href),
      loader.loadAsync(new URL('./model-assets/blink1mk2_enclosure_frame_v3k.stl', import.meta.url).href),
    ]);
    if (disposed) { diffuserGeometry.dispose(); frameGeometry.dispose(); return; }
    model = createBlink1Model(THREE, { diffuserGeometry, frameGeometry });
    diffuserGeometry.dispose(); frameGeometry.dispose();
    model.group.rotation.set(.035, -.12, .1);
    scene.add(model.group);
    restingPosition.copy(model.group.position); restingRotation.copy(model.group.rotation);
    const box = new THREE.Box3().setFromObject(model.group);
    const target = box.getCenter(new THREE.Vector3());
    camera = new THREE.PerspectiveCamera(30, 1, .05, 100);
    camera.position.copy(target).add(new THREE.Vector3(-5.5, 7.5, 11)); camera.lookAt(target);
    controls = new OrbitControls(camera, canvas);
    controls.target.copy(target);
    controls.enablePan = false; controls.enableZoom = false;
    controls.enableDamping = !motion.matches; controls.dampingFactor = .16;
    controls.rotateSpeed = .65;
    controls.minPolarAngle = .18; controls.maxPolarAngle = Math.PI - .18;
    canvas.style.touchAction = 'pan-y';
    controls.update(); controls.saveState();
    const initialCamera = camera.position.clone();
    function stats() {
      stage.dataset.viewYaw = controls.getAzimuthalAngle().toFixed(5);
      stage.dataset.viewPitch = controls.getPolarAngle().toFixed(5);
      stage.dataset.viewZoom = camera.zoom.toFixed(5);
      setText(zoomScale, percentages[document.documentElement.lang === 'zh-CN' ? 'zh-CN' : 'en'].format(camera.zoom));
      buttons['zoom-in'].disabled = stage.dataset.threeState !== 'ready' || camera.zoom >= 1.8 - .00001;
      buttons['zoom-out'].disabled = stage.dataset.threeState !== 'ready' || camera.zoom <= .7 + .00001;
      stage.dataset.viewMotion = dragging ? 'dragging' : rocking ? 'rocking' : 'idle';
    }
    function stopFrames() { if (active) { renderer.setAnimationLoop(null); active = false; } }
    function requestRender() {
      dirty = true;
      if (active || disposed || !visible || document.hidden || stage.dataset.threeState !== 'ready') return;
      active = true; renderer.setAnimationLoop(tick);
    }
    function stopRock() {
      rocking = false; model.group.position.copy(restingPosition); model.group.rotation.copy(restingRotation);
      updateLabels(); stats(); requestRender();
    }
    function tick(time) {
      if (disposed || document.hidden || !visible || stage.dataset.threeState !== 'ready') { stopFrames(); return; }
      const elapsed = Math.min(.1, (time - (lastTime || time)) / 1000); lastTime = time;
      const moved = controls.update(elapsed);
      if (rocking) {
        const age = (time - rockStart) / 1000;
        if (age >= 6 || motion.matches) stopRock();
        else {
          const envelope = Math.sin(Math.PI * Math.min(1, age / 6));
          model.group.rotation.y = restingRotation.y + Math.sin(age * 2.8) * .12 * envelope;
          model.group.rotation.z = restingRotation.z + Math.sin(age * 2.8 + .5) * .025 * envelope;
          model.group.position.x = restingPosition.x + Math.sin(age * 2.8) * .045 * envelope;
          dirty = true;
        }
      }
      ground.visible = controls.getPolarAngle() < Math.PI / 2 + .1;
      if (dirty || moved || rocking) { renderer.render(scene, camera); stage.dataset.viewFrames = String(Number(stage.dataset.viewFrames || 0) + 1); dirty = false; }
      stats();
      if (!moved && !rocking && !dragging && !dirty) stopFrames();
    }
    function fit() {
      const width = theatre.clientWidth, height = theatre.clientHeight;
      if (width < 1 || height < 1) return;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      camera.updateMatrixWorld();
      const point = new THREE.Vector3(), matrix = new THREE.Matrix4();
      const direction = camera.position.clone().sub(controls.target).normalize();
      const distance = camera.position.distanceTo(controls.target);
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const vertical = Math.max(100, height - 92) / height;
      const horizontal = Math.max(100, width - 28) / width;
      let fittedDistance = 0;
      model.group.updateMatrixWorld(true);
      model.group.traverse(mesh => {
        const positions = mesh.geometry?.getAttribute('position');
        if (!positions) return;
        matrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
        for (let index = 0; index < positions.count; index++) {
          point.fromBufferAttribute(positions, index).applyMatrix4(matrix);
          const depth = point.z + distance;
          fittedDistance = Math.max(fittedDistance, depth + Math.abs(point.y) / (tangent * vertical), depth + Math.abs(point.x) / (tangent * aspect * horizontal));
        }
      });
      // A restrained photographic perspective lets reflections vary across planar metal.
      camera.position.copy(controls.target).addScaledVector(direction, fittedDistance * 1.03);
      camera.aspect = aspect; camera.updateProjectionMatrix(); controls.update(); requestRender();
    }
    ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: 0x3c5260, opacity: .13, depthWrite: false }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = box.min.y - .035; ground.receiveShadow = true; scene.add(ground);
    const shadowPixels = new Uint8Array(128 * 128 * 4);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const radius = ((x - 63.5) / 55) ** 2 + ((y - 63.5) / 48) ** 2;
      const i = (y * 128 + x) * 4;
      shadowPixels[i] = 35; shadowPixels[i + 1] = 55; shadowPixels[i + 2] = 65;
      shadowPixels[i + 3] = Math.round(255 * Math.exp(-radius * 3) * Math.max(0, 1 - radius / 2));
    }
    const shadowMap = new THREE.DataTexture(shadowPixels, 128, 128); shadowMap.needsUpdate = true;
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(5.3, 3.3), new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, opacity: .2, depthWrite: false }));
    contact.position.set(.05, 0, .008); ground.add(contact);
    const resize = new ResizeObserver(fit); resize.observe(theatre);
    const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; if (visible) requestRender(); else { stopRock(); stopFrames(); } }); intersection.observe(theatre);
    function settleControls() {
      const damping = controls.enableDamping;
      controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
    }
    function rotate(deltaYaw, deltaPitch = 0) {
      stopRock(); settleControls();
      const offset = camera.position.clone().sub(controls.target), spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta += deltaYaw; spherical.phi = THREE.MathUtils.clamp(spherical.phi + deltaPitch, controls.minPolarAngle, controls.maxPolarAngle);
      camera.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(controls.target)); controls.update(); requestRender();
    }
    buttons.left.addEventListener('click', () => rotate(-.3)); buttons.right.addEventListener('click', () => rotate(.3));
    buttons.flip.addEventListener('click', () => rotate(0, Math.PI - 2 * controls.getPolarAngle()));
    buttons.reset.addEventListener('click', () => { stopRock(); settleControls(); camera.position.copy(initialCamera); controls.reset(); camera.zoom = 1; fit(); stats(); requestRender(); });
    buttons.rock.addEventListener('click', () => { if (rocking) stopRock(); else if (!motion.matches) { rocking = true; rockStart = performance.now(); updateLabels(); stats(); requestRender(); } });
    controls.addEventListener('start', () => { dragging = true; stopRock(); stats(); });
    controls.addEventListener('end', () => { dragging = false; stats(); requestRender(); });
    controls.addEventListener('change', requestRender);
    function zoomTo(value) {
      stopRock(); camera.zoom = THREE.MathUtils.clamp(value, .7, 1.8); camera.updateProjectionMatrix(); stats(); requestRender();
    }
    buttons['zoom-in'].addEventListener('click', () => zoomTo(camera.zoom * 1.2));
    buttons['zoom-out'].addEventListener('click', () => zoomTo(camera.zoom / 1.2));
    canvas.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? theatre.clientHeight : 1);
      zoomTo(camera.zoom * Math.exp(-pixels * .002));
    }, { passive: false });
    let pinchDistance = 0, pinchZoom = 1;
    const fingerDistance = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    function startPinch(event) {
      if (event.touches.length < 2) return;
      event.preventDefault(); stopRock(); settleControls(); controls.enableRotate = false; dragging = false;
      pinchDistance = Math.max(1, fingerDistance(event.touches)); pinchZoom = camera.zoom; stats();
    }
    function endPinch(event) {
      if (event?.touches.length >= 2) { startPinch(event); return; }
      pinchDistance = 0; controls.enableRotate = true; dragging = false; stats(); requestRender();
    }
    canvas.addEventListener('touchstart', startPinch, { passive: false });
    canvas.addEventListener('touchmove', event => {
      if (event.touches.length < 2) return;
      event.preventDefault(); if (!pinchDistance) startPinch(event);
      zoomTo(pinchZoom * fingerDistance(event.touches) / pinchDistance);
    }, { passive: false });
    canvas.addEventListener('touchend', endPinch, { passive: false });
    canvas.addEventListener('touchcancel', endPinch, { passive: false });
    canvas.addEventListener('keydown', event => {
      const directions = { ArrowLeft: [-.2, 0], ArrowRight: [.2, 0], ArrowUp: [0, -.15], ArrowDown: [0, .15] };
      if (directions[event.key]) { event.preventDefault(); rotate(...directions[event.key]); }
      if (event.key === 'Home') { event.preventDefault(); buttons.reset.click(); }
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomTo(camera.zoom * 1.2); }
      if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomTo(camera.zoom / 1.2); }
    });
    function colors() {
      const values = ['one', 'two'].map(key => { const value = stage.querySelector(`[data-studio-color="${key}"]`)?.textContent.trim(); return /^#[a-f\d]{6}$/i.test(value || '') ? value : null; });
      model.setColors(...values, stage.dataset.studioSource); requestRender();
    }
    const colorObserver = new MutationObserver(colors);
    colorObserver.observe(stage, { attributes: true, attributeFilter: ['data-studio-source'] });
    for (const output of stage.querySelectorAll('[data-studio-color]')) colorObserver.observe(output, {childList: true, subtree: true});
    motion.addEventListener('change', () => { controls.enableDamping = !motion.matches; if (motion.matches) stopRock(); updateLabels(); requestRender(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { endPinch(); stopRock(); stopFrames(); } else requestRender(); });
    window.addEventListener('pageshow', () => requestRender());
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stage.dataset.threeState = 'lost'; endPinch(); stopRock(); stopFrames(); controls.enabled = false; updateLabels(); });
    canvas.addEventListener('webglcontextrestored', () => { stage.dataset.threeState = 'ready'; controls.enabled = true; updateLabels(); requestRender(); });
    window.addEventListener('pagehide', event => {
      endPinch(); stopRock(); stopFrames(); if (event.persisted) return;
      disposed = true; resize.disconnect(); intersection.disconnect(); colorObserver.disconnect(); localeObserver.disconnect(); controls.dispose(); model.dispose(); ground.traverse(object => { object.geometry?.dispose(); object.material?.map?.dispose(); object.material?.dispose(); }); environment.dispose(); renderer.dispose();
    });
    stage.dataset.threeState = 'ready'; updateLabels(); colors(); fit(); stats(); requestRender();
  }
  setup().catch(() => { renderer?.setAnimationLoop(null); renderer?.dispose(); model?.dispose(); environment?.dispose(); fallback(); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
