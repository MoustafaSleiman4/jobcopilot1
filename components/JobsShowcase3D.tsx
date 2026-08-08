"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type ShowcaseCardJob = {
  title: string;
  company: string;
  location: string;
};

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

// A single job-listing "card" texture — drawn on an offscreen 2D canvas
// (same approach as Hero3D's icon cards) rather than an image asset, since
// the text is real, live data pulled per-visitor and can't be a static
// file. Deliberately unlit-material-friendly: flat, high-contrast colors
// baked directly into the texture rather than relying on any lighting.
function makeJobCardTexture(job: ShowcaseCardJob): THREE.CanvasTexture {
  const w = 320;
  const h = 200;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  roundRectPath(ctx, 5, 5, w - 10, h - 10, 22);
  ctx.fillStyle = "#fdf9ec";
  ctx.fill();
  ctx.strokeStyle = "rgba(217,173,63,0.65)";
  ctx.lineWidth = 4;
  ctx.stroke();

  // Small emerald "briefcase" badge, top-left.
  roundRectPath(ctx, 22, 22, 38, 38, 11);
  ctx.fillStyle = "#0f8f66";
  ctx.fill();
  ctx.strokeStyle = "#fdf9ec";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  roundRectPath(ctx, 32, 36, 18, 15, 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(32, 42);
  ctx.lineTo(50, 42);
  ctx.stroke();

  // "HIRING NOW" pill, top-right — the recurring visual hook that sells
  // "this is live," not just a static mockup.
  ctx.font = "bold 12px Arial";
  const pillLabel = "HIRING NOW";
  const pillWidth = ctx.measureText(pillLabel).width + 22;
  roundRectPath(ctx, w - 22 - pillWidth, 26, pillWidth, 26, 13);
  ctx.fillStyle = "rgba(15,143,102,0.12)";
  ctx.fill();
  ctx.fillStyle = "#0f8f66";
  ctx.textBaseline = "middle";
  ctx.fillText(pillLabel, w - 22 - pillWidth + 11, 26 + 13);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#085f43";
  ctx.font = "bold 22px Arial";
  ctx.fillText(truncateToWidth(ctx, job.title, w - 44), 22, 96);

  ctx.fillStyle = "#b8892f";
  ctx.font = "600 17px Arial";
  ctx.fillText(truncateToWidth(ctx, job.company, w - 44), 22, 124);

  ctx.fillStyle = "rgba(8,95,67,0.6)";
  ctx.font = "14px Arial";
  ctx.fillText(truncateToWidth(ctx, job.location || "Gulf Region", w - 44), 22, 148);

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

type RingConfig = { radius: number; y: number; count: number; speed: number };
// Three concentric, vertically-staggered rings of cards orbiting a central
// glowing column — reads as a dense, continuously-turning "drum" of job
// listings rather than one or two static tiles, which is the whole point:
// communicating "there are thousands of these" at a glance.
const RINGS: RingConfig[] = [
  { radius: 3.3, y: 1.3, count: 8, speed: 0.16 },
  { radius: 4.0, y: 0, count: 9, speed: -0.12 },
  { radius: 3.3, y: -1.3, count: 8, speed: 0.16 },
];

type OrbitCard = { mesh: THREE.Mesh; baseAngle: number; radius: number; y: number; speed: number };

/**
 * Homepage "jobs showcase" — a fully 3D, continuously turning drum of real
 * job-listing cards (title/company/location, live from public.retrieved_jobs
 * via app/api/jobs/showcase) orbiting a glowing central column, meant to
 * visually sell "this site is full of real, current jobs" rather than just
 * stating it in text.
 *
 * Follows the same conventions as components/Hero3D.tsx (the only other 3D
 * surface in this app): vanilla three.js, unlit MeshBasicMaterial for every
 * card (a lit material goes dark/muddy at orbit angles the point lights
 * don't reach — see Hero3D's card material comment for the full story),
 * per-frame lookAt(camera.position) billboarding so text is never mirrored
 * or foreshortened away, reduced-motion/WebGL-unsupported bailouts, full
 * cleanup on unmount, and mouse parallax.
 *
 * Receives its job data as a prop rather than fetching it itself — the
 * parent (components/JobsShowcase.tsx) owns the fetch and hydration-safe
 * initial state, and remounts this component (via a React `key`) the one
 * time live data replaces the static fallback, rather than this component
 * trying to rebuild textures in place.
 */
export default function JobsShowcase3D({ jobs }: { jobs: ShowcaseCardJob[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (jobs.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }

    let frameId = 0;
    let disposed = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    const baseCameraZ = 6.8;
    camera.position.set(0, 0.6, baseCameraZ);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xfdf3d9, 0.7));
    const goldLight = new THREE.PointLight(0xd9ad3f, 3.5, 24);
    goldLight.position.set(3, 2.5, 4);
    scene.add(goldLight);
    const emeraldLight = new THREE.PointLight(0x0f8f66, 3, 24);
    emeraldLight.position.set(-3, -1, 3);
    scene.add(emeraldLight);

    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    // Central glowing column — a stream of jobs "pouring" through the
    // middle of the drum. Unlit + additive-feeling transparency, matching
    // the same lesson as the orbit cards below.
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 4.4, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xd9ad3f, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    worldGroup.add(column);

    const columnGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: makeGlowTexture("#0f8f66"), transparent: true, opacity: 0.55, depthWrite: false })
    );
    columnGlow.scale.set(3, 3, 1);
    worldGroup.add(columnGlow);

    // Rising particles along the column — a slow upward stream reinforcing
    // "new jobs constantly flowing in," looping back to the bottom once
    // they clear the top.
    const streamCount = 60;
    const streamGeometry = new THREE.BufferGeometry();
    const streamPositions = new Float32Array(streamCount * 3);
    const streamSpeeds = new Float32Array(streamCount);
    for (let i = 0; i < streamCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 0.05 + Math.random() * 0.18;
      streamPositions[i * 3] = Math.cos(angle) * r;
      streamPositions[i * 3 + 1] = (Math.random() - 0.5) * 4.4;
      streamPositions[i * 3 + 2] = Math.sin(angle) * r;
      streamSpeeds[i] = 0.25 + Math.random() * 0.35;
    }
    streamGeometry.setAttribute("position", new THREE.BufferAttribute(streamPositions, 3));
    const stream = new THREE.Points(
      streamGeometry,
      new THREE.PointsMaterial({ color: 0xf3dd97, size: 0.05, transparent: true, opacity: 0.85 })
    );
    worldGroup.add(stream);

    // Build the orbiting card drum, cycling through the supplied jobs list
    // if there are fewer jobs than card slots (always true for the SSR-safe
    // fallback list, rarely true once live data replaces it).
    const cardTextureCache = new Map<number, THREE.CanvasTexture>();
    let jobCursor = 0;
    const cards: OrbitCard[] = [];
    RINGS.forEach((ring) => {
      for (let i = 0; i < ring.count; i++) {
        const job = jobs[jobCursor % jobs.length];
        let texture = cardTextureCache.get(jobCursor % jobs.length);
        if (!texture) {
          texture = makeJobCardTexture(job);
          cardTextureCache.set(jobCursor % jobs.length, texture);
        }
        jobCursor++;

        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 0.83), material);
        const baseAngle = (i / ring.count) * Math.PI * 2;
        mesh.position.set(Math.cos(baseAngle) * ring.radius, ring.y, Math.sin(baseAngle) * ring.radius);
        worldGroup.add(mesh);
        cards.push({ mesh, baseAngle, radius: ring.radius, y: ring.y, speed: ring.speed });
      }
    });

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 13),
      new THREE.MeshBasicMaterial({ map: makeGlowTexture("#0f8f66"), transparent: true, opacity: 0.32, depthWrite: false })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3;
    worldGroup.add(ground);

    const particleCount = 110;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 13;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 5 - 1;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: 0xf3dd97, size: 0.035, transparent: true, opacity: 0.45 })
    );
    scene.add(particles);

    worldGroup.scale.setScalar(0.0001);
    const entranceStart = performance.now();

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
      // This section spans the full page width, so its container is much
      // wider/shorter than Hero3D's compact block — a fixed camera distance
      // clips the top/bottom card rings on a wide, short viewport. Pull the
      // camera back proportionally to how far the aspect ratio exceeds a
      // roughly-square frame.
      camera.position.z = baseCameraZ * Math.min(1.7, Math.max(1, aspect / 2.1));
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

      const entranceT = Math.min((performance.now() - entranceStart) / 1000, 1);
      const eased = entranceT * entranceT * (3 - 2 * entranceT);
      worldGroup.scale.setScalar(Math.max(0.0001, eased));

      column.rotation.y = t * 0.3;
      columnGlow.material.opacity = 0.45 + 0.15 * Math.sin(t * 1.1);

      const streamPos = streamGeometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < streamCount; i++) {
        let y = streamPos.getY(i) + streamSpeeds[i] * 0.016;
        if (y > 2.2) y = -2.2;
        streamPos.setY(i, y);
      }
      streamPos.needsUpdate = true;

      cards.forEach((card) => {
        const angle = card.baseAngle + t * card.speed;
        card.mesh.position.set(Math.cos(angle) * card.radius, card.y, Math.sin(angle) * card.radius);
        card.mesh.lookAt(camera.position);
      });

      worldGroup.rotation.y = Math.sin(t * 0.05) * 0.12;
      particles.rotation.y = t * 0.015;

      curX += (targetX - curX) * 0.04;
      curY += (targetY - curY) * 0.04;
      camera.position.x = curX * 1.3;
      camera.position.y = 0.6 - curY * 0.6;
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
      cardTextureCache.forEach((texture) => texture.dispose());
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
    // Intentionally runs once per mount: the parent remounts this component
    // via a `key` change when live job data replaces the fallback list, so
    // a fresh effect run (with the new `jobs` closed over) is exactly what
    // should happen — no in-place texture rebuilding needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />;
}
