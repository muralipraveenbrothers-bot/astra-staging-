import { useEffect, useRef } from 'react';
import * as T from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createExplosionLayout } from '@/services/humanAtlasExplosionLayout';
import { decodeModelResponse } from '@/services/humanAtlasModelDownload';
import { PointerTap } from '@/services/humanAtlasPointerTap';
import { SYSTEMS, type Atlas, type SceneState } from '@/services/humanAtlas';

interface Props {
  atlas: Atlas;
  state: SceneState;
  onSelect: (id: string) => void;
  onProgress: (n: number) => void;
  onError: (s: string) => void;
}

export default function AnatomyScene({ atlas, state, onSelect, onProgress, onError }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(state);
  const select = useRef(onSelect);
  latest.current = state;
  select.current = onSelect;

  useEffect(() => {
    const el = host.current!;
    let disposed = false, frame = 0, dirty = true, ready = false, lastView = '', lastReset = -1, lastIsolate = '', layoutKey = '', amount = 0;
    let lastState: SceneState | null = null;
    const abort = new AbortController();
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      onError('This browser could not start the 3D viewer. Please try a browser with WebGL enabled.');
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 768 ? 1.5 : 2));
    // Dark background for Astra medical theme
    renderer.setClearColor('#0f172a');
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    el.appendChild(renderer.domElement);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(34, 1, .005, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    camera.position.set(1.4, 1.05, 3.6);
    controls.target.set(0, .85, 0);
    controls.enableDamping = true;
    controls.dampingFactor = .085;
    controls.minDistance = .07;
    controls.maxDistance = 40;
    controls.maxPolarAngle = Math.PI * .96;
    controls.addEventListener('change', () => { dirty = true; });

    const pmrem = new T.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, .04);
    scene.environment = env.texture;
    room.dispose();
    pmrem.dispose();

    scene.add(new T.HemisphereLight(0xc8d8e8, 0x203040, 1.2));
    const key = new T.DirectionalLight(0xfffaf4, 2.5);
    key.position.set(-2, 4, 3);
    scene.add(key);
    const rim = new T.DirectionalLight(0x38bdf8, 1.4);
    rim.position.set(2, 2, -3);
    scene.add(rim);

    // Dark ground for Astra theme
    const ground = new T.Mesh(new T.CircleGeometry(30, 96), new T.MeshStandardMaterial({ color: 0x0f172a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -.019;
    scene.add(ground);
    const platform = new T.Mesh(new T.CylinderGeometry(.68, .7, .028, 100), new T.MeshStandardMaterial({ color: 0x1e293b, metalness: .2, roughness: .6 }));
    platform.position.y = -.016;
    scene.add(platform);
    const ring = new T.Mesh(new T.RingGeometry(.63, .632, 128), new T.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: .5, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = .001;
    scene.add(ring);

    const width = T.MathUtils.ceilPowerOfTwo(atlas.parts.length);
    const data = new Float32Array(width * 4);
    const partTexture = new T.DataTexture(data, width, 1, T.RGBAFormat, T.FloatType);
    partTexture.needsUpdate = true;
    const selectedData = new Uint8Array(width * 4);
    const selectionTexture = new T.DataTexture(selectedData, width, 1);
    selectionTexture.needsUpdate = true;

    const materials: T.Material[] = [], geometries: T.BufferGeometry[] = [], pickers: (T.Mesh | undefined)[] = [];
    const centers = atlas.parts.map(p => new T.Vector3().fromArray(p.bounds[0]).add(new T.Vector3().fromArray(p.bounds[1])).multiplyScalar(.5));
    const offsets: T.Vector3[] = [], bounds = atlas.parts.map(p => new T.Box3(new T.Vector3().fromArray(p.bounds[0]), new T.Vector3().fromArray(p.bounds[1])));
    let packingWidth = 1, packingHeight = 1;

    const materialFor = (system: string) => {
      const m = new T.MeshStandardMaterial({
        color: SYSTEMS.find(s => s.id === system)?.color ?? '#aebbb8',
        metalness: .08, roughness: .53, side: T.DoubleSide,
        transparent: system === 'integumentary',
        opacity: system === 'integumentary' ? .1 : 1,
        depthWrite: system !== 'integumentary',
      });
      m.onBeforeCompile = shader => {
        shader.uniforms.partState = { value: partTexture };
        shader.uniforms.selectionState = { value: selectionTexture };
        shader.uniforms.stateWidth = { value: width };
        shader.vertexShader = 'attribute float partIndex; uniform sampler2D partState; uniform sampler2D selectionState; uniform float stateWidth; varying float partVisible; varying float partSelected;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvec2 stateUv = vec2((partIndex + 0.5) / stateWidth, 0.5); vec4 state = texture2D(partState, stateUv); transformed += state.xyz; partVisible = state.w; partSelected = texture2D(selectionState, stateUv).r;');
        shader.fragmentShader = 'varying float partVisible; varying float partSelected;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (partVisible < 0.5) discard;');
        // Astra cyan highlight on selection
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.82, 0.95), partSelected * 0.8);');
      };
      materials.push(m);
      return m;
    };

    const mats = new Map(SYSTEMS.map(s => [s.id, materialFor(s.id)]));
    let loaded = 0;
    const loadChunk = async (ci: number) => {
      const chunk = atlas.chunks[ci];
      // Always fetch the raw .bin (not .gz) — .gz files not served in dev
      const response = await fetch(chunk.url, { signal: abort.signal });
      const buffer = await decodeModelResponse(response, chunk.bytes, false);
      if (disposed) return;
      const groups = new Map<string, T.BufferGeometry[]>();
      atlas.parts.forEach((p, i) => {
        if (p.chunk !== ci) return;
        const g = new T.BufferGeometry();
        // Use .slice() to create a standalone ArrayBuffer from the byte-offset view
        // This is required because Three.js BufferAttribute needs a zero-offset TypedArray
        const posBuf = new Float32Array(buffer.slice(p.positions, p.positions + p.vertexCount * 3 * 4));
        const normBuf = new Int16Array(buffer.slice(p.normals, p.normals + p.vertexCount * 3 * 2));
        const idxBuf = new Uint32Array(buffer.slice(p.indices, p.indices + p.indexCount * 4));
        g.setAttribute('position', new T.BufferAttribute(posBuf, 3));
        g.setAttribute('normal', new T.BufferAttribute(normBuf, 3, true));
        g.setIndex(new T.BufferAttribute(idxBuf, 1));
        g.boundingBox = bounds[i].clone();
        g.computeBoundingSphere();
        const pick = new T.Mesh(g);
        pick.matrixAutoUpdate = false;
        pickers[i] = pick;
        geometries.push(g);
        g.setAttribute('partIndex', new T.BufferAttribute(new Float32Array(p.vertexCount).fill(i), 1));
        const list = groups.get(p.system) ?? [];
        list.push(g);
        groups.set(p.system, list);
      });
      groups.forEach((gs, system) => {
        const geometry = mergeGeometries(gs, false);
        if (!geometry) throw new Error('Could not assemble anatomy geometry.');
        geometries.push(geometry);
        const mesh = new T.Mesh(geometry, mats.get(system as never));
        mesh.frustumCulled = false;
        scene.add(mesh);
      });
      lastState = null;
      loaded++;
      onProgress(Math.round(loaded / atlas.chunks.length * 100));
      dirty = true;
    };

    (async () => {
      try {
        let cursor = 0;
        await Promise.all(Array.from({ length: 3 }, async () => {
          while (cursor < atlas.chunks.length) { const i = cursor++; await loadChunk(i); }
        }));
        if (!disposed) { ready = true; dirty = true; }
      } catch (e) {
        if (!disposed) onError(e instanceof Error ? e.message : 'Could not load the anatomy.');
      }
    })();

    const fit = (view: string, extent = 0) => {
      const mobile = el.clientWidth < 768;
      const normalDistance = mobile ? 4.5 : 4;
      const direction = view === 'front' ? new T.Vector3(0, .02, 1) : view === 'back' ? new T.Vector3(0, .02, -1) : view === 'side' ? new T.Vector3(1, .02, 0) : new T.Vector3(.35, .06, 1).normalize();
      controls.target.set(0, .85, 0);
      camera.position.copy(controls.target).addScaledVector(direction, normalDistance);
      controls.update();
      dirty = true;
    };

    const resize = () => {
      layoutKey = ''; lastState = null;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
      fit(latest.current.view, amount);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    const raycaster = new T.Raycaster(), pointer = new T.Vector2(), tap = new PointerTap(), worldBox = new T.Box3(), hitPoint = new T.Vector3();
    const down = (e: PointerEvent) => { tap.down(e.pointerId, e.clientX, e.clientY, e.pointerType === 'touch' ? 12 : 5); };
    const up = (e: PointerEvent) => {
      const validTap = tap.up(e.pointerId, e.clientX, e.clientY);
      if (!validTap || !ready) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      let nearest = Infinity, found = -1;
      const hasSolid = atlas.parts.some((p, i) => p.system !== 'integumentary' && data[i * 4 + 3] > .5);
      pickers.forEach((mesh, i) => {
        if (!mesh || data[i * 4 + 3] < .5 || (hasSolid && atlas.parts[i].system === 'integumentary')) return;
        worldBox.copy(bounds[i]).translate(mesh.position);
        if (!raycaster.ray.intersectBox(worldBox, hitPoint)) return;
        const hits = raycaster.intersectObject(mesh, false);
        if (hits[0] && hits[0].distance < nearest) { nearest = hits[0].distance; found = i; }
      });
      if (found >= 0) { select.current(atlas.parts[found].id); }
    };

    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointerup', up);
    renderer.domElement.addEventListener('pointermove', (e) => { tap.move(e.pointerId, e.clientX, e.clientY); });
    renderer.domElement.addEventListener('pointercancel', (e) => { tap.cancel(e.pointerId); });

    const clock = new T.Clock();
    const animate = () => {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), .05), s = latest.current;
      const changed = lastState?.visible !== s.visible || lastState?.selected !== s.selected || lastState?.isolate !== s.isolate;
      const moving = Math.abs(amount - s.explode) > .0001;
      if (moving) { amount = T.MathUtils.damp(amount, s.explode, 8, dt); dirty = true; }
      if (changed || moving) {
        const visible = new Set(s.visible), selection = new Set(s.selected);
        const visibleParts = atlas.parts.filter(p => s.isolate ? selection.has(p.id) : visible.has(p.system) || selection.has(p.id));
        const nextLayoutKey = visibleParts.map(p => p.id).join(',') + ':' + camera.aspect.toFixed(3);
        if (nextLayoutKey !== layoutKey) {
          const layout = createExplosionLayout(visibleParts, camera.aspect);
          packingWidth = layout.width; packingHeight = layout.height;
          atlas.parts.forEach((p, i) => { const cell = layout.cells.get(p.id); offsets[i] = cell ? new T.Vector3(cell.x, cell.y + .85, 0) : centers[i].clone(); });
          layoutKey = nextLayoutKey;
        }
        atlas.parts.forEach((p, i) => {
          const c = centers[i], destination = offsets[i]; let dx = 0, dy = 0, dz = 0;
          if (amount <= .45) { const t = amount / .45; const group = SYSTEMS.findIndex(sys => sys.id === p.system); const angle = group / SYSTEMS.length * Math.PI * 2; dx = Math.sin(angle) * t * .48; dy = (c.y - .85) * t * .28; dz = Math.cos(angle) * t * .48; }
          else { const t = (amount - .45) / .55, group = SYSTEMS.findIndex(sys => sys.id === p.system), angle = group / SYSTEMS.length * Math.PI * 2; dx = T.MathUtils.lerp(Math.sin(angle) * .48, destination.x - c.x, t); dy = T.MathUtils.lerp((c.y - .85) * .28, destination.y - c.y, t); dz = T.MathUtils.lerp(Math.cos(angle) * .48, -c.z, t); }
          const selected = selection.has(p.id);
          data.set([dx, dy, dz, (s.isolate ? selected : visible.has(p.system) || selected) ? 1 : 0], i * 4);
          selectedData[i * 4] = selected ? 255 : 0;
          const mesh = pickers[i]; if (mesh) { mesh.position.set(dx, dy, dz); mesh.updateMatrix(); mesh.updateMatrixWorld(true); }
        });
        partTexture.needsUpdate = true; selectionTexture.needsUpdate = true; lastState = s; dirty = true;
      }
      if (s.view !== lastView || s.reset !== lastReset) { fit(s.view, amount); lastView = s.view; lastReset = s.reset; }
      controls.autoRotate = s.rotate && !s.isolate && amount < .4;
      controls.autoRotateSpeed = .65;
      controls.update();
      if (controls.autoRotate) dirty = true;
      if (dirty) { renderer.render(scene, camera); dirty = false; }
    };
    animate();

    return () => {
      disposed = true; abort.abort(); cancelAnimationFrame(frame); observer.disconnect();
      controls.dispose(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      env.dispose(); partTexture.dispose(); selectionTexture.dispose();
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [atlas]);

  return <div ref={host} style={{ width: '100%', height: '100%' }} />;
}
