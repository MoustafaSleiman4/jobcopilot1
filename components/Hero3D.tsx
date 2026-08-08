"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Small "job search" icon cards that orbit the copilot core — drawn on an
// offscreen 2D canvas rather than imported image assets, so the whole scene
// stays a single self-contained module with no extra files to ship or go
// missing.
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

function makeGlowTexture(color: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `${color}80`);
  gradient.addColorStop(0.5, `${color}26`);
  gradient.addColorStop(1, `${color}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

type OrbitCard = { mesh: THREE.Mesh; angle: number; speed: number; tilt: number; radius: number };
type RingPoint = THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> & {
  userData: { angle: number; radius: number; speed: number; y: number };
};

/**
 * The homepage hero's centerpiece: a fully 3D "AI copilot" orb — a glowing
 * icosahedron core wrapped in a rotating wireframe shell, orbited by three
 * job-search icon cards (resume, briefcase, application-check) and a thin
 * ring of drifting light points, floating above a soft ground glow. Built
 * directly with three.js (no react-three-fiber — this is the only 3D
 * surface in the app, so a full scene-graph wrapper would add abstraction
 * with nothing else to amortize it against).
 *
 * This replaced an earlier version of this component that rendered real
 * Gulf landmarks (Al Faisaliah Tower, Burj Khalifa) as 3D buildings —
 * removed per design feedback in favor of this abstract centerpiece, which
 * sidesteps the layout problems the buildings ran into (their fixed,
 * wide-spread geometry fought with wherever the headline text needed to
 * sit) while staying just as clearly "a real 3D animation," not a static
 * illustration.
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
    // The whole scene (core + orbit radius ~1.6 + ring radius ~2.1) fits in
    // a tight ~4.5 world-unit sphere, so a short, fixed camera distance is
    // enough at any container aspect — no towers to keep spread across a
    // wide frame here, so the aspect-based pull-back the old scene needed
    // doesn't apply.
    const baseCameraZ = 5.6;
    camera.position.set(0, 0.4, baseCameraZ);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xfdf3d9, 0.65));
    const goldLight = new THREE.PointLight(0xd9ad3f, 4.5, 20);
    goldLight.position.set(2.5, 2, 3);
    scene.add(goldLight);
    const emeraldLight = new THREE.PointLight(0x0f8f66, 3.5, 20);
    emeraldLight.position.set(-2.5, 1, 2.5);
    scene.add(emeraldLight);
    const backLight = new THREE.PointLight(0xffffff, 1.4, 20);
    backLight.position.set(0, 2, -3);
    scene.add(backLight);

    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    // The core: a glowing gold icosahedron wrapped in a slowly counter-
    // rotating white wireframe shell — the "AI copilot" itself.
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.72, 1),
      new THREE.MeshStandardMaterial({
        color: 0xd9ad3f,
        emissive: 0xd9ad3f,
        emissiveIntensity: 0.55,
        metalness: 0.3,
        roughness: 0.25,
      })
    );
    worldGroup.add(core);

    const coreWire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.94, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.32 })
    );
    worldGroup.add(coreWire);

    const coreGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: makeGlowTexture("#d9ad3f"), transparent: true, opacity: 0.8, depthWrite: false })
    );
    coreGlow.scale.set(3.4, 3.4, 1);
    worldGroup.add(coreGlow);

    // Three job-search icon cards orbiting the core on tilted paths.
    // MeshBasicMaterial (unlit) rather than MeshStandardMaterial — these are
    // small flat "sticker" cards, not physical objects, and a PBR material
    // here made them read as dull olive smudges instead of the cream card
    // with a gold border baked into the texture: as they orbit through
    // angles where none of the scene's point lights hit their camera-facing
    // side, a lit material has nothing to reflect and goes dark regardless
    // of the texture underneath. Unlit guarantees the texture's own colors
    // always show, at every orbit angle.
    const glyphs: Array<"briefcase" | "resume" | "check"> = ["briefcase", "resume", "check"];
    const cards: OrbitCard[] = glyphs.map((glyph, i) => {
      const material = new THREE.MeshBasicMaterial({
        map: makeIconTexture(glyph),
        transparent: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), material);
      worldGroup.add(mesh);
      return {
        mesh,
        angle: (i / glyphs.length) * Math.PI * 2,
        speed: 0.42 + i * 0.09,
        tilt: (i % 2 === 0 ? 1 : -1) * 0.35,
        radius: 1.9,
      };
    });

    // A thin ring of small drifting light points further out — gives the
    // scene a second, slower layer of motion beyond the core + cards so it
    // reads as a genuine orbiting system rather than one object spinning.
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x0f8f66, transparent: true, opacity: 0.75 });
    const ringPoints: RingPoint[] = Array.from({ length: 14 }, (_, i) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), ringMaterial) as RingPoint;
      const angle = (i / 14) * Math.PI * 2;
      mesh.userData = { angle, radius: 2.5 + (i % 3) * 0.08, speed: 0.12, y: (i % 2 === 0 ? 1 : -1) * 0.15 };
      worldGroup.add(mesh);
      return mesh;
    });

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({ map: makeGlowTexture("#0f8f66"), transparent: true, opacity: 0.4, depthWrite: false })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.1;
    worldGroup.add(ground);

    const particleCount = 90;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4 - 1;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: 0xf3dd97, size: 0.035, transparent: true, opacity: 0.5 })
    );
    scene.add(particles);

    // Entrance: the whole rig scales up from near-nothing with a soft
    // overshoot-free ease, reading as the copilot "materializing" rather
    // than a generic fade-in.
    worldGroup.scale.setScalar(0.0001);
    const entranceStart = performance.now();

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
      camera.aspect = width / height;
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

      const entranceT = Math.min((performance.now() - entranceStart) / 900, 1);
      const eased = entranceT * entranceT * (3 - 2 * entranceT);
      worldGroup.scale.setScalar(Math.max(0.0001, eased));

      core.rotation.y = t * 0.4;
      core.rotation.x = t * 0.15;
      coreWire.rotation.y = -t * 0.25;
      coreWire.rotation.x = t * 0.18;
      coreGlow.material.opacity = 0.65 + 0.15 * Math.sin(t * 1.3);

      cards.forEach((card) => {
        const angle = card.angle + t * card.speed;
        card.mesh.position.set(
          Math.cos(angle) * card.radius,
          Math.sin(angle * 0.8) * 0.55 + card.tilt,
          Math.sin(angle) * card.radius
        );
        card.mesh.lookAt(camera.position);
      });

      ringPoints.forEach((point) => {
        const angle = point.userData.angle + t * point.userData.speed;
        point.position.set(
          Math.cos(angle) * point.userData.radius,
          point.userData.y + Math.sin(t * 0.5 + point.userData.angle) * 0.12,
          Math.sin(angle) * point.userData.radius
        );
      });

      worldGroup.rotation.y = Math.sin(t * 0.08) * 0.22;
      particles.rotation.y = t * 0.02;

      curX += (targetX - curX) * 0.04;
      curY += (targetY - curY) * 0.04;
      camera.position.x = curX * 1.1;
      camera.position.y = 0.4 - curY * 0.5;
      camera.lookAt(0, 0, 0);

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
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Sprite) {
          obj.geometry?.dispose?.();
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
