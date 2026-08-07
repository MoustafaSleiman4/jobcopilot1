"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Coordinate mapping: every tower below is traced from the exact same path
// coordinates as components/decorative/SkylineSilhouette.tsx's flat SVG
// skyline (viewBox 1200x260, ground at y=260) rather than invented from
// scratch — that SVG was already carefully tuned against real reference
// photos of each landmark, so reusing its numbers keeps this 3D version
// unmistakably the same three buildings instead of a generic skyline, and
// keeps it visually consistent with the flat silhouette still used
// elsewhere in the same hero section.
// ---------------------------------------------------------------------------
const SVG_GROUND_Y = 260;
const SCALE = 1 / 42;
const TOWER_DEPTH = 1.1;

function sx(svgX: number, centerX: number) {
  return (svgX - centerX) * SCALE;
}
function sy(svgY: number) {
  return (SVG_GROUND_Y - svgY) * SCALE;
}

function extrudeCentered(shape: THREE.Shape, depth = TOWER_DEPTH) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function makeStrut(x1: number, y1: number, x2: number, y2: number, material: THREE.Material) {
  const start = new THREE.Vector3(x1, y1, 0);
  const end = new THREE.Vector3(x2, y2, 0);
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = dir.length() || 0.001;
  const geometry = new THREE.CylinderGeometry(0.5 * SCALE, 0.5 * SCALE, length, 6);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

type WindowLight = THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> & {
  userData: { phase: number; speed: number };
};

function addWindowLights(
  group: THREE.Group,
  count: number,
  yRange: [number, number],
  xRange: [number, number]
): WindowLight[] {
  const lights: WindowLight[] = [];
  for (let i = 0; i < count; i++) {
    const material = new THREE.MeshBasicMaterial({ color: 0xfaf0cd, transparent: true, opacity: 0.7 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), material) as WindowLight;
    const y = yRange[0] + Math.random() * (yRange[1] - yRange[0]);
    const x = xRange[0] + Math.random() * (xRange[1] - xRange[0]);
    mesh.position.set(x, y, TOWER_DEPTH / 2 + 0.02);
    mesh.userData = { phase: Math.random() * Math.PI * 2, speed: 0.6 + Math.random() * 0.8 };
    group.add(mesh);
    lights.push(mesh);
  }
  return lights;
}

// ---- Al Faisaliah Tower (Riyadh) — tapered obelisk, signature gold sphere
// braced near the tip, needle spire continuing above it. -------------------
function buildFaisaliah(): THREE.Group {
  const centerX = 140;
  const shape = new THREE.Shape();
  shape.moveTo(sx(117, centerX), sy(260));
  shape.lineTo(sx(131, centerX), sy(100));
  shape.lineTo(sx(149, centerX), sy(100));
  shape.lineTo(sx(163, centerX), sy(260));
  shape.closePath();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x0f8f66,
    emissive: 0x0b7754,
    emissiveIntensity: 0.45,
    metalness: 0.2,
    roughness: 0.4,
  });
  const goldMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9ad3f,
    emissive: 0xd9ad3f,
    emissiveIntensity: 0.7,
    metalness: 0.45,
    roughness: 0.25,
  });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(extrudeCentered(shape), bodyMaterial));

  const sphere = new THREE.Mesh(new THREE.SphereGeometry(19 * SCALE, 16, 16), goldMaterial);
  sphere.position.set(0, sy(80), 0);
  group.add(sphere);

  const spireHeight = sy(14) - sy(61);
  const spire = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2 * SCALE, 1.7 * SCALE, spireHeight, 8),
    goldMaterial
  );
  spire.position.set(0, sy(61) + spireHeight / 2, 0);
  group.add(spire);

  const finial = new THREE.Mesh(new THREE.SphereGeometry(2.6 * SCALE, 8, 8), goldMaterial);
  finial.position.set(0, sy(12), 0);
  group.add(finial);

  group.add(makeStrut(sx(131, centerX), sy(101), sx(126, centerX), sy(86), goldMaterial));
  group.add(makeStrut(sx(149, centerX), sy(101), sx(154, centerX), sy(86), goldMaterial));

  return group;
}

// ---- Burj Khalifa (Dubai) — tiered, stepped setbacks tapering to a
// needle-thin spire, traced point-for-point from the flat silhouette. ------
function buildBurjKhalifa(): THREE.Group {
  const centerX = 600;
  const points: [number, number][] = [
    [572, 260], [572, 190], [576, 190], [576, 140], [580, 140], [580, 105],
    [584, 105], [584, 78], [588, 78], [588, 58], [592, 58], [600, 5],
    [608, 58], [612, 58], [612, 78], [616, 78], [616, 105], [620, 105],
    [620, 140], [624, 140], [624, 190], [628, 190], [628, 260],
  ];
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => {
    const X = sx(x, centerX);
    const Y = sy(y);
    if (i === 0) shape.moveTo(X, Y);
    else shape.lineTo(X, Y);
  });
  shape.closePath();

  const material = new THREE.MeshStandardMaterial({
    color: 0x0f8f66,
    emissive: 0x0b7754,
    emissiveIntensity: 0.45,
    metalness: 0.25,
    roughness: 0.35,
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(extrudeCentered(shape, TOWER_DEPTH * 0.85), material));
  return group;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Small "job search" icon cards that orbit the copilot core above the
// skyline — drawn on an offscreen 2D canvas rather than imported image
// assets, so the whole scene stays a single self-contained module with no
// extra files to ship or go missing.
function makeIconTexture(glyph: "briefcase" | "resume" | "check"): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  roundRectPath(ctx, 6, 6, size - 12, size - 12, 36);
  ctx.fillStyle = "#fdf9ec";
  ctx.fill();
  ctx.strokeStyle = "rgba(217,173,63,0.6)";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.strokeStyle = "#085f43";
  ctx.fillStyle = "#085f43";
  ctx.lineWidth = 11;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const c = size / 2;
  if (glyph === "briefcase") {
    roundRectPath(ctx, c - 60, c - 22, 120, 90, 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c - 60, c + 6);
    ctx.lineTo(c + 60, c + 6);
    ctx.stroke();
    roundRectPath(ctx, c - 26, c - 50, 52, 32, 8);
    ctx.stroke();
  } else if (glyph === "resume") {
    roundRectPath(ctx, c - 46, c - 66, 92, 132, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c - 20, c - 34, 12, 0, Math.PI * 2);
    ctx.stroke();
    [c - 4, c + 18, c + 40].forEach((ly) => {
      ctx.beginPath();
      ctx.moveTo(c - 30, ly);
      ctx.lineTo(c + 30, ly);
      ctx.stroke();
    });
  } else {
    ctx.beginPath();
    ctx.arc(c, c, 66, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c - 30, c + 2);
    ctx.lineTo(c - 8, c + 26);
    ctx.lineTo(c + 34, c - 30);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(15,143,102,0.5)");
  gradient.addColorStop(0.5, "rgba(15,143,102,0.15)");
  gradient.addColorStop(1, "rgba(15,143,102,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

type OrbitCard = { mesh: THREE.Mesh; angle: number; speed: number; tilt: number };

function buildOrbitLayer(): { group: THREE.Group; core: THREE.Mesh; coreWire: THREE.Mesh; cards: OrbitCard[] } {
  const group = new THREE.Group();

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.55, 1),
    new THREE.MeshStandardMaterial({
      color: 0xd9ad3f,
      emissive: 0xd9ad3f,
      emissiveIntensity: 0.5,
      metalness: 0.3,
      roughness: 0.3,
    })
  );
  group.add(core);

  const coreWire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.72, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.3 })
  );
  group.add(coreWire);

  const glyphs: Array<"briefcase" | "resume" | "check"> = ["briefcase", "resume", "check"];
  const cards: OrbitCard[] = glyphs.map((glyph, i) => {
    const material = new THREE.MeshStandardMaterial({
      map: makeIconTexture(glyph),
      transparent: true,
      roughness: 0.4,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), material);
    group.add(mesh);
    return { mesh, angle: (i / glyphs.length) * Math.PI * 2, speed: 0.4 + i * 0.08, tilt: (i % 2 === 0 ? 1 : -1) * 0.3 };
  });

  return { group, core, coreWire, cards };
}

/**
 * The homepage hero's centerpiece: a stylized, animated 3D rendition of two
 * real Gulf landmarks — Al Faisaliah Tower (Riyadh) on the left and Burj
 * Khalifa (Dubai) on the right — rising into place with a glowing "AI
 * copilot" orb orbited by job-search icon cards hovering above the skyline
 * between them. Built directly with three.js (no react-three-fiber — this
 * is the only 3D surface in the app, so a full scene-graph wrapper would add
 * abstraction with nothing else to amortize it against).
 *
 * Dynamically imported with `ssr: false` from the homepage (see
 * app/[locale]/page.tsx) — WebGL has no meaning during server rendering,
 * and this keeps the three.js chunk out of the initial HTML/hydration path
 * entirely; it downloads and mounts only once the browser reaches this
 * component.
 */
export default function Hero3D() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Same reduced-motion contract as every other animation in this app
    // (see ScrollReveal, globals.css's prefers-reduced-motion block) — skip
    // mounting the WebGL scene entirely rather than rendering a static
    // frame, since a static three.js frame still pays the full
    // bundle-download + init cost for zero benefit to someone who's asked
    // for less motion.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      // WebGL unsupported/blocked — leave the hero without the 3D layer
      // rather than throwing and breaking the rest of the page.
      return;
    }

    let frameId = 0;
    let disposed = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    // Pulled in from 12 now that only two towers need to fit in frame (down
    // from three) — a tighter shot reads as bigger/closer, which also suits
    // the shorter canvas this scene now renders into (see the reduced hero
    // container height in app/[locale]/page.tsx).
    const baseCameraZ = 10;
    camera.position.set(0, 3.4, baseCameraZ);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xfdf3d9, 0.6));
    const goldLight = new THREE.PointLight(0xd9ad3f, 4, 40);
    goldLight.position.set(6, 6, 8);
    scene.add(goldLight);
    const emeraldLight = new THREE.PointLight(0x0f8f66, 3, 40);
    emeraldLight.position.set(-6, 2, 6);
    scene.add(emeraldLight);
    const backLight = new THREE.PointLight(0xffffff, 1.2, 40);
    backLight.position.set(0, 4, -6);
    scene.add(backLight);

    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    // Faisaliah on the left, Burj Khalifa on the right — Kingdom Centre
    // removed from the scene entirely per design feedback, leaving open sky
    // (and the orbiting copilot layer) between the two remaining towers.
    const faisaliah = buildFaisaliah();
    faisaliah.position.x = -2.7;
    const burj = buildBurjKhalifa();
    burj.position.x = 2.7;

    // Rise-up entrance, staggered left to right — each tower's group pivots
    // from the ground (y=0 is the shared ground plane every shape was
    // traced against), so animating scale.y from ~0 to 1 reads as the
    // skyline genuinely building itself up rather than a generic fade-in.
    const towers = [
      { group: faisaliah, delay: 0 },
      { group: burj, delay: 0.2 },
    ];
    towers.forEach((tower) => {
      tower.group.scale.y = 0.0001;
      worldGroup.add(tower.group);
    });

    const allLights: WindowLight[] = [
      ...addWindowLights(faisaliah, 8, [sy(110), sy(240)], [sx(122, 140), sx(158, 140)]),
      ...addWindowLights(burj, 10, [sy(60), sy(240)], [sx(578, 600), sx(622, 600)]),
    ];

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 8),
      new THREE.MeshBasicMaterial({ map: makeGlowTexture(), transparent: true, opacity: 0.5, depthWrite: false })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    worldGroup.add(ground);

    const orbit = buildOrbitLayer();
    orbit.group.position.set(0, 6.6, 0);
    worldGroup.add(orbit.group);

    const particleCount = 160;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 1] = Math.random() * 9 + 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8 - 3;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: 0xf3dd97, size: 0.035, transparent: true, opacity: 0.5 })
    );
    scene.add(particles);

    // Pointer parallax — lerped toward the target each frame for a smooth
    // "the whole scene follows your cursor" feel rather than snapping.
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    function handlePointerMove(e: PointerEvent) {
      const rect = container!.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      targetX = THREE.MathUtils.clamp(nx, -1, 1);
      targetY = THREE.MathUtils.clamp(ny, -1, 1);
    }
    window.addEventListener("pointermove", handlePointerMove);

    function handleResize() {
      const { width, height } = container!.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      const aspect = width / height;
      camera.aspect = aspect;
      // Narrower/taller containers (mobile) need the camera pulled back
      // further to keep both towers in frame — a fixed camera distance
      // that looks right on a wide desktop hero crops the left and right
      // towers on a narrow phone viewport.
      camera.position.z = aspect < 1.6 ? baseCameraZ * (1.6 / Math.max(aspect, 0.75)) : baseCameraZ;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    handleResize();

    const clock = new THREE.Clock();
    function animate() {
      if (disposed) return;
      const t = clock.getElapsedTime();

      towers.forEach((tower) => {
        const localT = Math.max(0, Math.min((t - tower.delay) / 1.1, 1));
        const eased = localT * localT * (3 - 2 * localT);
        tower.group.scale.y = Math.max(0.0001, eased);
      });

      allLights.forEach((light) => {
        light.material.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * light.userData.speed + light.userData.phase));
      });

      orbit.core.rotation.y = t * 0.4;
      orbit.coreWire.rotation.y = -t * 0.25;
      orbit.coreWire.rotation.x = t * 0.15;
      orbit.cards.forEach((card) => {
        const angle = card.angle + t * card.speed;
        card.mesh.position.set(Math.cos(angle) * 1.6, Math.sin(angle * 0.8) * 0.5 + card.tilt, Math.sin(angle) * 1.6);
        card.mesh.lookAt(camera.position);
      });
      orbit.group.position.y = 6.6 + Math.sin(t * 0.6) * 0.12;

      worldGroup.rotation.y = Math.sin(t * 0.05) * 0.18;
      particles.rotation.y = t * 0.015;

      curX += (targetX - curX) * 0.04;
      curY += (targetY - curY) * 0.04;
      camera.position.x = curX * 1.1;
      camera.position.y = 3.4 - curY * 0.5;
      camera.lookAt(0, 3, 0);

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }
    frameId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("pointermove", handlePointerMove);
      resizeObserver.disconnect();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const material = obj.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />;
}
