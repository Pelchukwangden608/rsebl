// Interactive 3D "market skyline": one tower per listed company.
// Drag to orbit, scroll to zoom, hover for details, click a tower to open the company.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const SECTOR_COLORS = {
  Banking: "#8b7cf6", Insurance: "#38bdf8", Manufacturing: "#f0b429",
  Tourism: "#ec4899", Publishing: "#4ee6a5",
};
const POS = new THREE.Color("#22c55e"), NEG = new THREE.Color("#ef4444"), FLAT = new THREE.Color("#7c82a0");

export default function Market3D({ items, metric, onOpen, selected }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const [hover, setHover] = useState(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  /* -------- build scene once -------- */
  useEffect(() => {
    const mount = mountRef.current;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const w = mount.clientWidth, h = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(w, h);
    labelRenderer.domElement.className = "sky-labels";
    mount.appendChild(labelRenderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 200);
    camera.position.set(8.5, 7.5, 10);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 8;
    controls.maxDistance = 32;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.target.set(0, 1.2, 0);
    controls.autoRotate = !reduceMotion;
    controls.autoRotateSpeed = 0.6;
    controls.addEventListener("start", () => { controls.autoRotate = false; });

    scene.add(new THREE.HemisphereLight(0xc9c3ff, 0x1a1530, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
    scene.add(sun);
    const rim = new THREE.PointLight(0x8b7cf6, 30, 40);
    rim.position.set(-8, 6, -8);
    scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(14, 64),
      new THREE.MeshStandardMaterial({ color: 0x5a4bc4, transparent: true, opacity: 0.12, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.PolarGridHelper(13, 16, 8, 64, 0x5a4bc4, 0x3a3270);
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    scene.add(grid);

    const towers = [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0); // grow from the floor
    const cols = Math.ceil(Math.sqrt(items.length));
    const gap = 2.1;
    items.forEach((it, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = (c - (cols - 1) / 2) * gap, z = (r - (Math.ceil(items.length / cols) - 1) / 2) * gap;
      const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.35, metalness: 0.25, emissive: 0x000000 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0, z);
      mesh.scale.set(1.15, 0.01, 1.15);
      mesh.castShadow = true;
      mesh.userData = { symbol: it.symbol, target: 0.01, idx: i };
      scene.add(mesh);

      const base = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.08, 1.55),
        new THREE.MeshStandardMaterial({ color: SECTOR_COLORS[it.sector] || "#888", roughness: 0.6 })
      );
      base.position.set(x, 0.04, z);
      base.receiveShadow = true;
      scene.add(base);

      const div = document.createElement("div");
      div.className = "sky-label";
      div.textContent = it.symbol;
      const label = new CSS2DObject(div);
      label.position.set(0, 1.05, 0);
      scene.add(label);
      towers.push({ mesh, label, base });
    });

    /* hover + click via raycasting */
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hovered = null, downAt = null, downMesh = null;
    const pick = (ev) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(towers.map((t) => t.mesh))[0];
      return hit ? { mesh: hit.object, x: ev.clientX - rect.left, y: ev.clientY - rect.top } : null;
    };
    const onMove = (ev) => {
      const p = pick(ev);
      hovered = p?.mesh || null;
      renderer.domElement.style.cursor = hovered ? "pointer" : "grab";
      setHover(p ? { symbol: p.mesh.userData.symbol, x: p.x, y: p.y } : null);
    };
    const onLeave = () => { hovered = null; setHover(null); };
    const onDown = (ev) => { downAt = [ev.clientX, ev.clientY]; downMesh = pick(ev)?.mesh || hovered; };
    const onUp = (ev) => {
      if (!downAt) return;
      const moved = Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]);
      downAt = null;
      const target = pick(ev)?.mesh || downMesh;
      downMesh = null;
      if (moved < 6 && target) onOpenRef.current(target.userData.symbol);
    };
    const el = renderer.domElement;
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);

    const ro = new ResizeObserver(() => {
      const W = mount.clientWidth, H = mount.clientHeight;
      if (!W || !H) return;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H);
      labelRenderer.setSize(W, H);
    });
    ro.observe(mount);

    let raf;
    const clock = new THREE.Clock();
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      towers.forEach(({ mesh, label }) => {
        const cur = mesh.scale.y, tgt = mesh.userData.target;
        const next = reduceMotion ? tgt : cur + (tgt - cur) * Math.min(1, dt * 5);
        mesh.scale.y = next;
        label.position.set(mesh.position.x, next + 0.55, mesh.position.z);
        const isHover = mesh === hovered;
        const isSel = mesh.userData.symbol === sceneRef.current?.selected;
        const glow = isHover ? 0.55 : isSel ? 0.3 : 0;
        mesh.material.emissive.copy(mesh.material.color).multiplyScalar(glow);
        const s = isHover ? 1.28 : 1.15;
        mesh.scale.x += (s - mesh.scale.x) * 0.2;
        mesh.scale.z = mesh.scale.x;
      });
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    sceneRef.current = { towers, selected };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      controls.dispose();
      scene.traverse((o) => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
      renderer.dispose();
      mount.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.symbol).join()]);

  /* -------- update heights / colours when the metric changes -------- */
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.selected = selected;
    const vals = items.map((it) => it.value);
    const maxAbs = Math.max(...vals.map((v) => Math.abs(v ?? 0)), 1e-9);
    s.towers.forEach(({ mesh, label }, i) => {
      const it = items[i];
      const v = it.value;
      const norm = v == null ? 0 : Math.abs(v) / maxAbs;
      mesh.userData.target = 0.15 + norm * 5.2;
      let col;
      if (metric === "cap") col = new THREE.Color(SECTOR_COLORS[it.sector] || "#888");
      else col = v > 0.0001 ? POS.clone() : v < -0.0001 ? NEG.clone() : FLAT.clone();
      mesh.material.color.copy(col);
      label.element.classList.toggle("sel", it.symbol === selected);
    });
  }, [items, metric, selected]);

  const h = hover && items.find((i) => i.symbol === hover.symbol);
  return (
    <div className="sky-wrap">
      <div className="sky-canvas" ref={mountRef} />
      {h && (
        <div className="sky-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="sky-tip-sym">{h.symbol} <span>{h.sector}</span></div>
          <div className="sky-tip-name">{h.name}</div>
          <div className="sky-tip-val">{h.display}</div>
          <div className="sky-tip-cta">Click to open →</div>
        </div>
      )}
      <div className="sky-legend">
        {metric === "cap"
          ? Object.entries(SECTOR_COLORS).map(([k, c]) => <span key={k}><i style={{ background: c }} />{k}</span>)
          : <><span><i style={{ background: "#22c55e" }} />Positive</span><span><i style={{ background: "#ef4444" }} />Negative</span><span><i style={{ background: "#7c82a0" }} />Flat / no data</span></>}
      </div>
      <div className="sky-hint">Drag to rotate · Scroll to zoom · Click a tower</div>
    </div>
  );
}
