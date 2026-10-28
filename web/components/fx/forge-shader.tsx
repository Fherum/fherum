"use client";

import { useEffect, useRef } from "react";

/** Full-bleed molten-iron field. Raw WebGL, one fragment shader. Pointer adds heat. */
const FRAG = `
precision highp float;
uniform vec2 r; uniform float t; uniform vec2 m; uniform float heat;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<6;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/r; vec2 p=uv*vec2(r.x/r.y,1.)*2.2;
  float tt=t*.06;
  vec2 q=vec2(fbm(p+tt),fbm(p-tt+5.2));
  float f=fbm(p+3.*q+vec2(0.,-t*.12));
  float d=distance(uv*vec2(r.x/r.y,1.),m*vec2(r.x/r.y,1.));
  float glow=heat*exp(-d*d*9.);
  float v=pow(f,2.4)*1.6+glow*.9;
  // seams: thin hot cracks
  float seam=smoothstep(.02,.0,abs(fract(f*6.)-.5)-.47)*.35;
  v+=seam*(.4+glow);
  vec3 c=mix(vec3(.02,.02,.025),vec3(.35,.04,.02),smoothstep(.15,.45,v));
  c=mix(c,vec3(1.,.33,.08),smoothstep(.45,.8,v));
  c=mix(c,vec3(1.,.86,.55),smoothstep(.85,1.2,v));
  // scanline grid (cipher lattice)
  vec2 g=fract(gl_FragCoord.xy/22.);
  c*=.86+.14*step(.06,g.x)*step(.06,g.y);
  gl_FragColor=vec4(c,1.);
}`;

export function ForgeShader({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!; const gl = cv.getContext("webgl", { antialias: false });
    if (!gl) return;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, "attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}"));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr); gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (k: string) => gl.getUniformLocation(pr, k);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let mx = 0.7, my = 0.5, tx = 0.7, ty = 0.5, heat = 0.4, th = 0.4, raf = 0; const t0 = performance.now();
    const size = () => { const d = Math.min(1.5, devicePixelRatio); cv.width = cv.clientWidth * d * 0.6; cv.height = cv.clientHeight * d * 0.6; gl.viewport(0, 0, cv.width, cv.height); };
    const move = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width; ty = 1 - (e.clientY - r.top) / r.height; th = 1; };
    const down = () => { th = 2.2; };
    size(); addEventListener("resize", size); addEventListener("pointermove", move); addEventListener("pointerdown", down);
    const frame = (now: number) => {
      mx += (tx - mx) * 0.06; my += (ty - my) * 0.06; heat += (th - heat) * 0.05; th += (0.5 - th) * 0.01;
      gl.uniform2f(U("r"), cv.width, cv.height); gl.uniform1f(U("t"), reduce ? 8 : (now - t0) / 1000);
      gl.uniform2f(U("m"), mx, my); gl.uniform1f(U("heat"), heat);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", size); removeEventListener("pointermove", move); removeEventListener("pointerdown", down); };
  }, []);
  return <canvas ref={ref} aria-hidden className={`block size-full ${className}`} style={{ imageRendering: "pixelated" }} />;
}
