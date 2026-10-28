"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Float, Lightformer, OrbitControls, useTexture } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/** Canvas-drawn label texture — no remote fonts, works offline. */
function labelTexture(text: string, sub: string, hue: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(128, 110, 10, 128, 128, 128);
  grd.addColorStop(0, "#2a2a30"); grd.addColorStop(1, "#0c0c0e");
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = hue; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.5; g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#ece7df"; g.textAlign = "center";
  g.font = "600 40px ui-monospace, monospace"; g.fillText(text, 128, 138);
  g.fillStyle = hue; g.font = "500 18px ui-monospace, monospace"; g.fillText(sub, 128, 172);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function Core({ onFlip }: { onFlip: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const tex = useTexture("/brand/mark-512.png", (t) => { (Array.isArray(t) ? t : [t]).forEach((x) => { x.colorSpace = THREE.SRGBColorSpace; }); });
  const target = useRef(0);
  const [hover, setHover] = useState(false);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += (target.current - ref.current.rotation.y) * Math.min(1, dt * 4);
    const s = hover ? 1.06 : 1;
    ref.current.scale.lerp(new THREE.Vector3(s, s, s), dt * 6);
  });
  const click = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); target.current += Math.PI; onFlip(); };
  return (
    <group ref={ref} onClick={click}
      onPointerOver={() => { setHover(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.35, 1.35, 0.22, 96]} />
        <meshStandardMaterial attach="material-0" color="#b8b2aa" metalness={1} roughness={0.22} />
        <meshStandardMaterial attach="material-1" map={tex} metalness={0.7} roughness={0.28} />
        <meshStandardMaterial attach="material-2" map={tex} metalness={0.7} roughness={0.28} color="#c08a5b" />
      </mesh>
      <mesh><torusGeometry args={[1.36, 0.045, 24, 128]} /><meshStandardMaterial color="#c08a5b" metalness={1} roughness={0.18} /></mesh>
    </group>
  );
}

function Ring({ r, tilt, speed, color }: { r: number; tilt: [number, number, number]; speed: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += dt * speed; });
  return (
    <mesh ref={ref} rotation={tilt}>
      <torusGeometry args={[r, 0.018, 16, 200]} />
      <meshStandardMaterial color={color} metalness={1} roughness={0.15} />
    </mesh>
  );
}

const TOKENS = [
  { t: "euint64", s: "collateral", hue: "#c08a5b" },
  { t: "euint64", s: "debt", hue: "#e06a5a" },
  { t: "ebool", s: "solvent?", hue: "#5fb38a" },
  { t: "0x9f…", s: "handle", hue: "#b9b6b0" },
  { t: "HF", s: "ironclad", hue: "#d9a441" },
];

function Token({ i, n, onPick, active }: { i: number; n: number; onPick: (i: number) => void; active: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const tex = useMemo(() => labelTexture(TOKENS[i].t, TOKENS[i].s, TOKENS[i].hue), [i]);
  const [hover, setHover] = useState(false);
  useFrame(({ clock }, dt) => {
    if (!ref.current) return;
    const a = clock.elapsedTime * 0.25 + (i / n) * Math.PI * 2;
    ref.current.position.set(Math.cos(a) * 2.7, Math.sin(a * 2) * 0.35, Math.sin(a) * 1.4);
    ref.current.rotation.y += dt * (hover ? 4 : 0.8);
    const s = active ? 1.35 : hover ? 1.2 : 1;
    ref.current.scale.lerp(new THREE.Vector3(s, s, s), dt * 8);
  });
  return (
    <group ref={ref}
      onClick={(e) => { e.stopPropagation(); onPick(i); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.34, 0.06, 48]} />
        <meshStandardMaterial attach="material-0" color={TOKENS[i].hue} metalness={1} roughness={0.25} />
        <meshStandardMaterial attach="material-1" map={tex} metalness={0.4} roughness={0.4} />
        <meshStandardMaterial attach="material-2" map={tex} metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Dust({ count = 900 }) {
  const ref = useRef<THREE.Points>(null);
  const pos = useMemo(() => {
    const p = new Float32Array(count * 3);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      const r = 3 + rnd() * 5, t = rnd() * Math.PI * 2, f = Math.acos(2 * rnd() - 1);
      p.set([r * Math.sin(f) * Math.cos(t), r * Math.cos(f) * 0.6, r * Math.sin(f) * Math.sin(t)], i * 3);
    }
    return p;
  }, [count]);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y -= dt * 0.03; });
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry>
      <pointsMaterial size={0.025} color="#c08a5b" transparent opacity={0.7} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/** Pull the camera back on narrow canvases so the orbit rings never hit the canvas edge. */
function FitCamera({ radius = 3.3, baseZ = 6.2 }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const half = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const aspect = size.width / Math.max(size.height, 1);
    cam.position.setLength(Math.max(baseZ, radius / (half * Math.min(aspect, 1))));
    cam.updateProjectionMatrix();
  }, [camera, size, radius, baseZ]);
  return null;
}

export default function HeroScene({ reduced, onFlip, onPick, picked }: {
  reduced: boolean; onFlip: () => void; onPick: (i: number) => void; picked: number | null;
}) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0.4, 6.2], fov: 40 }} frameloop={reduced ? "demand" : "always"} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.25} />
      <directionalLight position={[4, 5, 3]} intensity={2} />
      <pointLight position={[-4, -2, 2]} intensity={30} color="#c08a5b" />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 4, -4]} scale={[10, 2, 1]} />
        <Lightformer form="rect" intensity={2} position={[-5, 0, 2]} rotation-y={Math.PI / 2} scale={[6, 1, 1]} />
        <Lightformer form="ring" intensity={2} color="#c08a5b" position={[5, 1, 0]} rotation-y={-Math.PI / 2} scale={3} />
      </Environment>
      <Float speed={reduced ? 0 : 1.4} rotationIntensity={0.35} floatIntensity={0.6}>
        <Core onFlip={onFlip} />
        <Ring r={1.85} tilt={[1.2, 0.3, 0]} speed={0.35} color="#d6d1c9" />
        <Ring r={2.15} tilt={[-1.1, -0.4, 0]} speed={-0.25} color="#c08a5b" />
      </Float>
      {TOKENS.map((_, i) => <Token key={i} i={i} n={TOKENS.length} onPick={onPick} active={picked === i} />)}
      <Dust />
      <FitCamera />
      <OrbitControls enableZoom={false} enablePan={false} autoRotate={!reduced} autoRotateSpeed={0.5}
        minPolarAngle={Math.PI / 3} maxPolarAngle={(Math.PI * 2) / 3} />
    </Canvas>
  );
}

export { TOKENS };
