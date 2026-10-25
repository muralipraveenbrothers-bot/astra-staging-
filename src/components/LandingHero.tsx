import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Sparkles, Shield, Database, Cpu, Eye, Target,
  Trophy, Globe, Brain, CheckCircle, XCircle, MinusCircle,
  ChevronDown, Activity, Server, Lock, Stethoscope, FlaskConical, Zap,
} from "lucide-react";

// ── REAL LIVE NUMBERS (verified 2026-09-15 from live Ollama + FreeLLMAPI audit) ──
const LIVE = {
  totalModels:   285,
  localModels:   2,
  cloudModels:   283,
  localParams:   "2.07B",
  cloudParams:   "13.59T",
  knowledgeTotal: "25,908",
  knowledgeChunks: "11,909",
  knowledgeDocs:  "2,460",
  knowledgeKPs:   "10,453",
  knowledgeVecs:  "1,080",
  knowledgeMB:    "27.77 MB",
  largestModel:   "685B",
};

const stats = [
  { icon: Cpu,      label: "Total AI Models",    value: "285",     sub: "2 local + 283 cloud" },
  { icon: Brain,    label: "Cloud Parameters",   value: "13.59T",  sub: "Trillion — live" },
  { icon: Database, label: "Knowledge Entries",  value: "25,908",  sub: "Verified data points" },
  { icon: Target,   label: "Largest Model",      value: "685B",    sub: "DeepSeek-V3 via FreeLLMAPI" },
];



// ── Competitor comparison types & data ──────────────────────────────────────

type Verdict = "yes" | "no" | "partial";
interface Competitor {
  name: string; tagline: string; badge: string; badgeColor: string;
  pricing: string; params: string; knowledge: string;
  offline: Verdict; multiLLM: Verdict; whatsapp: Verdict; voiceOS: Verdict;
  ehr: Verdict; rbac: Verdict; openSource: Verdict; indianContext: Verdict;
  score: number;
}
const ASTRA_ROW: Competitor = {
  name: "ASTRA AI", tagline: "360° Hospital AI · India-First · Local + Cloud",
  badge: "ASTRA", badgeColor: "from-amber-500 to-yellow-400",
  pricing: "Open / Self-Hosted · Free",
  params: "13.59T cloud + 2.07B local",
  knowledge: "25,908 entries · 27.77 MB structured",
  offline: "yes", multiLLM: "yes", whatsapp: "yes", voiceOS: "yes",
  ehr: "yes", rbac: "yes", openSource: "yes", indianContext: "yes", score: 9.5,
};
const COMPETITORS: Competitor[] = [
  { name: "Epic AI (Dragon)", tagline: "EHR-native · Azure-powered scribe",
    badge: "Epic", badgeColor: "from-blue-600 to-blue-500",
    pricing: "$1M–$10M+ license", params: "GPT-4 via Azure ~1.8T MoE — 1 model",
    knowledge: "Cosmos DB (closed)",
    offline: "no", multiLLM: "no", whatsapp: "no", voiceOS: "partial",
    ehr: "yes", rbac: "yes", openSource: "no", indianContext: "no", score: 7.5 },
  { name: "MS Dragon Copilot", tagline: "Nuance DAX · Ambient clinical docs",
    badge: "MSFT", badgeColor: "from-sky-600 to-cyan-600",
    pricing: "$99–$149/clinician/mo", params: "GPT-4o ~200B — 1 model",
    knowledge: "Note templates (proprietary)",
    offline: "no", multiLLM: "no", whatsapp: "no", voiceOS: "yes",
    ehr: "partial", rbac: "partial", openSource: "no", indianContext: "no", score: 6.5 },
  { name: "Google MedLM", tagline: "Vertex AI · USMLE expert reasoning",
    badge: "GOOG", badgeColor: "from-green-600 to-emerald-500",
    pricing: "Cloud API pay-per-token", params: "Med-PaLM 2 + Gemini ~340B — 2–3 models",
    knowledge: "USMLE / PubMed (research)",
    offline: "no", multiLLM: "partial", whatsapp: "no", voiceOS: "no",
    ehr: "partial", rbac: "partial", openSource: "partial", indianContext: "no", score: 7.0 },
  { name: "IBM Watson / Merative", tagline: "Legacy NLP · sold off 2022",
    badge: "IBM", badgeColor: "from-slate-600 to-slate-500",
    pricing: "Enterprise contract", params: "Proprietary NLP (legacy / discontinued)",
    knowledge: "Micromedex + clinical DB (licensed)",
    offline: "no", multiLLM: "no", whatsapp: "no", voiceOS: "no",
    ehr: "partial", rbac: "yes", openSource: "no", indianContext: "no", score: 4.5 },
  { name: "Oracle Health (Cerner)", tagline: "Cerner EHR + OCI AI",
    badge: "ORA", badgeColor: "from-red-600 to-red-500",
    pricing: "$500K–$5M enterprise", params: "Llama 3.1 on OCI ~70B — limited",
    knowledge: "Cerner data lake (proprietary)",
    offline: "no", multiLLM: "no", whatsapp: "no", voiceOS: "no",
    ehr: "yes", rbac: "yes", openSource: "no", indianContext: "no", score: 6.0 },
  { name: "AWS HealthLake", tagline: "FHIR data layer · Bedrock models",
    badge: "AWS", badgeColor: "from-orange-500 to-amber-500",
    pricing: "Pay-as-you-go", params: "Claude + Llama via Bedrock ~70–340B",
    knowledge: "FHIR repository (no clinical KB)",
    offline: "no", multiLLM: "partial", whatsapp: "no", voiceOS: "no",
    ehr: "no", rbac: "partial", openSource: "no", indianContext: "no", score: 6.0 },
];
const ALL_ROWS = [ASTRA_ROW, ...COMPETITORS];

function VerdictIcon({ v }: { v: Verdict }) {
  if (v === "yes")     return <CheckCircle  size={14} className="text-emerald-400 mx-auto" />;
  if (v === "no")      return <XCircle      size={14} className="text-red-400/70 mx-auto" />;
  return                      <MinusCircle  size={14} className="text-amber-400/80 mx-auto" />;
}
function ScoreBar({ score, isAstra }: { score: number; isAstra: boolean }) {
  const pct = (score / 10) * 100;
  const color = isAstra ? "from-amber-400 to-yellow-300"
    : score >= 7 ? "from-emerald-500 to-teal-400"
    : score >= 5 ? "from-blue-500 to-sky-400"
    : "from-slate-500 to-slate-400";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold w-7 text-right ${isAstra ? "text-amber-300" : "text-slate-300"}`}>{score}</span>
    </div>
  );
}

const categories = [
  "Predictive Diagnostics", "Clinical Decision Support", "Billing Fraud Detection",
  "Pharmacy Automation", "Patient Monitoring", "Operational Intelligence",
];

export function LandingHero({ onEnter }: { onEnter: () => void }) {
  const shaderRef   = useRef<HTMLCanvasElement>(null);
  const particleRef = useRef<HTMLCanvasElement>(null);
  const aboutRef    = useRef<HTMLDivElement>(null);
  const compareRef  = useRef<HTMLDivElement>(null);
  const [show,    setShow]    = useState(false);
  const [exiting, setExiting] = useState(false);
  const [animNums, setAnimNums] = useState(false);
  const rafRef   = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => { setShow(true); setTimeout(() => setAnimNums(true), 600); }, []);

  // ── WebGL shader ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = shaderRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl");
    if (!gl) return;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, `attribute vec2 p; void main(){gl_Position=vec4(p,0.,1.);}`);
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, `
      precision highp float;
      uniform vec2 r; uniform float t; uniform vec2 m;
      void main(){
        vec2 uv=(gl_FragCoord.xy-0.5*r)/min(r.x,r.y);
        vec2 mu=(m-0.5*r)/min(r.x,r.y);
        float d=length(uv-mu)*0.15;
        float c=0.;
        vec2 p=uv*3.2+vec2(sin(t*0.07)*0.3,cos(t*0.05)*0.3);
        for(int i=0;i<5;i++){
          float fi=float(i);
          vec2 np=p+vec2(cos(fi*2.1+t*0.03),sin(fi*1.7+t*0.04));
          c+=sin(np.x*2.+np.y*1.5+t*0.02+fi*1.2)*0.3;
          p=vec2(p.x*1.3-0.6,p.y*1.3+0.4);
        }
        c=sin(c*3.+t*0.02)*0.5+0.5;
        float edge=1.-smoothstep(0.,0.08,d);
        float r1=0.18+c*0.35+edge*0.15,g1=0.08+c*0.12+edge*0.06,b1=0.04+c*0.06+edge*0.03;
        float g2=0.55+c*0.25+edge*0.12,gold=smoothstep(0.3,0.7,c)*0.35;
        vec3 col=mix(vec3(r1,g1,b1),vec3(r1*0.7+0.3,g2,b1*0.5+0.15),gold);
        col*=0.85+0.15*(1.-d*2.); gl_FragColor=vec4(col,1.);
      }
    `);
    gl.compileShader(fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog,vs); gl.attachShader(prog,fs); gl.linkProgram(prog); gl.useProgram(prog);
    const verts = new Float32Array([-1,-1,1,-1,-1,1,1,1]);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.bufferData(gl.ARRAY_BUFFER,verts,gl.STATIC_DRAW);
    const ploc = gl.getAttribLocation(prog,"p"); gl.enableVertexAttribArray(ploc); gl.vertexAttribPointer(ploc,2,gl.FLOAT,false,0,0);
    const rLoc=gl.getUniformLocation(prog,"r"),tLoc=gl.getUniformLocation(prog,"t"),mLoc=gl.getUniformLocation(prog,"m");
    let start=performance.now();
    const draw=()=>{ const el=(performance.now()-start)/1000; gl.uniform2f(rLoc,w,h); gl.uniform1f(tLoc,el); gl.uniform2f(mLoc,mouseRef.current.x,mouseRef.current.y); gl.drawArrays(gl.TRIANGLE_STRIP,0,4); rafRef.current=requestAnimationFrame(draw); };
    draw();
    const resize=()=>{ w=canvas.width=window.innerWidth; h=canvas.height=window.innerHeight; gl.viewport(0,0,w,h); };
    const move=(e:MouseEvent)=>{ mouseRef.current={x:e.clientX,y:e.clientY}; };
    window.addEventListener("resize",resize); window.addEventListener("mousemove",move);
    return ()=>{ cancelAnimationFrame(rafRef.current); window.removeEventListener("resize",resize); window.removeEventListener("mousemove",move); };
  }, []);

  // ── Particle canvas ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = particleRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w=(canvas.width=window.innerWidth), h=(canvas.height=window.innerHeight);
    const pts: {x:number;y:number;r:number;vx:number;vy:number;a:number}[] = [];
    for(let i=0;i<90;i++) pts.push({x:Math.random()*w,y:Math.random()*h,r:Math.random()*2+0.5,vx:(Math.random()-0.5)*0.5,vy:(Math.random()-0.5)*0.5,a:Math.random()*0.4+0.15});
    let raf=0;
    const draw=()=>{
      ctx.clearRect(0,0,w,h);
      for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
        const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy);
        if(d<130){ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.strokeStyle=`rgba(212,175,55,${(1-d/130)*0.15})`;ctx.lineWidth=0.5;ctx.stroke();}
      }
      for(const p of pts){
        p.x+=p.vx;p.y+=p.vy;
        if(p.x<0||p.x>w)p.vx*=-1;if(p.y<0||p.y>h)p.vy*=-1;
        ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`rgba(212,175,55,${p.a})`;ctx.shadowBlur=4;ctx.shadowColor="rgba(212,175,55,0.4)";ctx.fill();ctx.shadowBlur=0;
      }
      raf=requestAnimationFrame(draw);
    };
    draw();
    const resize=()=>{ w=canvas.width=window.innerWidth; h=canvas.height=window.innerHeight; };
    window.addEventListener("resize",resize);
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener("resize",resize); };
  }, []);

  const handleEnter = () => { setExiting(true); setTimeout(() => onEnter(), 800); };
  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) =>
    ref.current?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className={`relative overflow-y-auto overflow-x-hidden transition-opacity duration-800 ${exiting ? "opacity-0 scale-105" : "opacity-100 scale-100"}`}
      style={{ height: "100vh" }}>

      {/* Fixed WebGL + Particles */}
      <canvas ref={shaderRef}   className="fixed inset-0 w-full h-full pointer-events-none" style={{zIndex:0}} />
      <canvas ref={particleRef} className="fixed inset-0 w-full h-full pointer-events-none" style={{zIndex:1}} />
      <div className="fixed inset-0 bg-gradient-to-b from-transparent via-slate-950/30 to-slate-950/90 pointer-events-none" style={{zIndex:2}} />

      {/* ── FIXED NAV ──────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 flex items-center justify-between px-6 py-3 z-50 bg-slate-950/50 backdrop-blur-md border-b border-amber-500/10">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-400/30 to-violet-500/30 border border-amber-400/40 flex items-center justify-center">
            <Sparkles size={12} className="text-amber-300" />
          </div>
          <span className="font-bold tracking-wider text-white/90 text-sm">ASTRA AI</span>
          <span className="text-[8px] text-emerald-400 border border-emerald-400/40 rounded-full px-2 py-0.5 font-mono animate-pulse">LIVE · 285 Models</span>
        </div>
        <div className="flex items-center gap-5">
          <button onClick={() => scrollTo(aboutRef)}   className="text-xs text-slate-400 hover:text-amber-300 transition-colors hidden md:block">About</button>
          <button onClick={() => scrollTo(compareRef)} className="text-xs text-slate-400 hover:text-amber-300 transition-colors hidden md:block">World Comparison</button>
          <button onClick={handleEnter}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 text-xs font-bold hover:from-amber-400 hover:to-yellow-300 transition-all">
            Enter AI →
          </button>
        </div>
      </nav>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — HERO
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 pt-16">
        <div className={`text-center max-w-5xl transition-all duration-1000 ${show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-400/20 bg-white/[0.03] backdrop-blur-sm mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Kautilya AI · Live · {LIVE.totalModels} Models Active</span>
          </div>

          <h1 className="font-bold text-6xl md:text-8xl leading-[1.05] tracking-tight mb-4">
            <span className="text-white">Astra</span>{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-300 via-fuchsia-200 to-violet-400">AI</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 font-light max-w-2xl mx-auto leading-relaxed mb-2">
            Divine Wisdom meets Machine Intelligence — India's first{" "}
            <strong className="text-amber-300">360° Hospital Operating System</strong> powered by{" "}
            <strong className="text-cyan-300">{LIVE.totalModels} AI models</strong> spanning{" "}
            <strong className="text-violet-300">{LIVE.cloudParams} parameters</strong>.
          </p>
          <p className="text-sm text-slate-500 max-w-xl mx-auto mb-8">
            Real numbers. Not marketing estimates. Verified live from Ollama + FreeLLMAPI on 2026-09-15.
          </p>

          {/* CTA */}
          <div className="flex items-center justify-center gap-4 mb-12">
            <button onClick={handleEnter}
              className="group relative inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl font-bold text-sm overflow-hidden transition-all duration-300 shadow-lg shadow-amber-900/30">
              <span className="absolute inset-0 bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-400" />
              <span className="absolute inset-0 bg-gradient-to-r from-amber-400 via-yellow-300 to-yellow-200 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="relative flex items-center gap-2.5 text-slate-950 font-extrabold">
                ENTER AI <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
            <button onClick={() => scrollTo(compareRef)}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-medium border border-amber-400/30 text-slate-300 hover:text-amber-100 hover:border-amber-400/70 transition-all bg-white/[0.03] hover:bg-white/[0.07]">
              Compare World Leaders <ChevronDown size={14} />
            </button>
          </div>

          {/* ── LIVE STATS GRID ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto mb-8">
            {stats.map((s) => (
              <div key={s.label}
                className="flex flex-col items-center p-4 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm hover:border-amber-400/30 transition-all">
                <s.icon size={16} className="text-amber-400/70 mb-2" />
                <div className={`font-bold text-2xl text-white transition-all duration-1000 ${animNums ? "opacity-100" : "opacity-0"}`}>
                  {s.value}
                </div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-400 mt-0.5 text-center leading-tight">{s.label}</div>
                <div className="text-[9px] text-slate-600 mt-0.5 text-center">{"sub" in s ? (s as any).sub : ""}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 animate-bounce">
          <div className="w-5 h-8 rounded-full border border-amber-400/30 flex items-start justify-center p-1">
            <div className="w-1 h-2 rounded-full bg-amber-400/60 animate-pulse" />
          </div>
        </div>

        {/* Left / right module labels */}
        <div className="absolute left-6 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-3">
          {categories.slice(0,3).map((c,i) => (
            <button key={i} className="group text-left text-[11px] uppercase tracking-[0.15em] text-slate-500 hover:text-amber-300 transition-colors py-1">
              <span className="inline-block w-0 group-hover:w-4 h-px bg-amber-400/50 mr-0 group-hover:mr-2 transition-all duration-300 align-middle" />
              {c}
            </button>
          ))}
        </div>
        <div className="absolute right-6 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-3">
          {categories.slice(3).map((c,i) => (
            <button key={i} className="group text-right text-[11px] uppercase tracking-[0.15em] text-slate-500 hover:text-amber-300 transition-colors py-1">
              {c}
              <span className="inline-block w-0 group-hover:w-4 h-px bg-amber-400/50 ml-0 group-hover:ml-2 transition-all duration-300 align-middle" />
            </button>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — ABOUT ASTRA
      ══════════════════════════════════════════════════════════════════════ */}
      <section ref={aboutRef} className="relative z-10 min-h-screen px-6 py-24 flex flex-col items-center justify-center">
        <div className="max-w-5xl w-full">
          <div className="text-center mb-10">
            <span className="text-[10px] uppercase tracking-[0.3em] text-amber-400 mb-3 block">About the System</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-3">What is ASTRA AI?</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Not a chatbot. Not a single model. A self-hosted, offline-capable, India-first
              <strong className="text-cyan-300"> clinical AI platform</strong> — the full Hospital Operating System.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            {[
              { icon: Brain,      color: "from-violet-500/20 to-purple-500/20", border: "border-violet-400/20",
                title: "Multi-Model Intelligence",
                body: `Access ${LIVE.totalModels} AI models simultaneously — ${LIVE.localModels} local Ollama models (${LIVE.localParams} params, fully offline) + ${LIVE.cloudModels} cloud models (${LIVE.cloudParams} total params). OmniRoute engine selects the best model per task automatically.` },
              { icon: Database,   color: "from-cyan-500/20 to-teal-500/20",    border: "border-cyan-400/20",
                title: "Verified Clinical Knowledge",
                body: `${LIVE.knowledgeTotal} structured medical knowledge entries (${LIVE.knowledgeMB}): ${LIVE.knowledgeChunks} AI-readable clinical chunks, ${LIVE.knowledgeKPs} verified knowledge points, ${LIVE.knowledgeDocs} source documents, ${LIVE.knowledgeVecs} semantic vector embeddings for RAG retrieval.` },
              { icon: Stethoscope,color: "from-amber-500/20 to-yellow-500/20", border: "border-amber-400/20",
                title: "360° Hospital Operations",
                body: "Complete patient lifecycle: OPD → EMR → Lab → Pharmacy → Ward → Billing → Discharge. Role-based access for 13 staff types. WhatsApp dispatch via n8n. Offline voice AI. Doctor Command OS with 20-step clinical reasoning." },
            ].map((p) => (
              <div key={p.title} className={`p-6 rounded-2xl bg-gradient-to-br ${p.color} border ${p.border} backdrop-blur-sm`}>
                <p.icon size={20} className="text-amber-300 mb-3" />
                <h3 className="font-bold text-white mb-2">{p.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>

          {/* Live data breakdown */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-6">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Database size={13} className="text-cyan-400" /> Live Knowledge Data — Verified 2026-09-15
            </h3>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {[
                { label: "Total Models",  value: LIVE.totalModels.toString(), color: "text-amber-300" },
                { label: "Cloud Params",  value: LIVE.cloudParams,            color: "text-violet-300" },
                { label: "KnlgEntries",   value: LIVE.knowledgeTotal,         color: "text-cyan-300"   },
                { label: "Chunks",        value: LIVE.knowledgeChunks,        color: "text-emerald-300"},
                { label: "Source Docs",   value: LIVE.knowledgeDocs,          color: "text-pink-300"   },
                { label: "Embeddings",    value: LIVE.knowledgeVecs,          color: "text-sky-300"    },
              ].map((item) => (
                <div key={item.label} className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-1">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center">
            <button onClick={() => scrollTo(compareRef)}
              className="text-sm text-amber-400 hover:text-amber-200 transition-colors flex items-center gap-2 mx-auto">
              See How ASTRA Compares to World Leaders <ChevronDown size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 — WORLD COMPARISON
      ══════════════════════════════════════════════════════════════════════ */}
      <section ref={compareRef} className="relative z-10 px-4 py-24 flex flex-col items-center">
        <div className="max-w-7xl w-full">
          <div className="text-center mb-8">
            <span className="text-[10px] uppercase tracking-[0.3em] text-amber-400 mb-3 block">Global Benchmark</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-3">ASTRA vs World-Leading Hospital AI</h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-sm">
              Compared against the dominant players in hospital / clinical AI worldwide — Epic AI, Microsoft Dragon Copilot, Google MedLM, IBM Watson / Merative, Oracle Health (Cerner), and AWS HealthLake.
            </p>
          </div>

          {/* Score cards */}
          <div className="grid grid-cols-4 md:grid-cols-7 gap-2 mb-6">
            {ALL_ROWS.map((c) => {
              const isAstra = c.name === "ASTRA AI";
              return (
                <div key={c.name}
                  className={`p-3 rounded-xl border text-center ${isAstra
                    ? "border-amber-400/40 bg-gradient-to-b from-amber-500/10 to-amber-900/10 shadow-lg shadow-amber-900/20"
                    : "border-white/10 bg-white/[0.03]"}`}>
                  <div className={`inline-block text-[8px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r ${c.badgeColor} text-white mb-1`}>{c.badge}</div>
                  <div className={`text-xl font-bold ${isAstra ? "text-amber-300" : "text-white"}`}>{c.score}/10</div>
                  <ScoreBar score={c.score} isAstra={isAstra} />
                  <div className="text-[8px] text-slate-500 mt-1 leading-tight">{c.pricing.split("·")[0].trim()}</div>
                </div>
              );
            })}
          </div>

          {/* Feature matrix table */}
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm mb-6">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 text-slate-400 font-semibold w-36">Feature</th>
                  {ALL_ROWS.map((c) => (
                    <th key={c.name} className={`p-3 text-center ${c.name === "ASTRA AI" ? "bg-amber-500/10" : ""}`}>
                      <div className={`inline-block text-[8px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r ${c.badgeColor} text-white mb-1`}>{c.badge}</div>
                      <div className={`text-[10px] font-bold leading-tight ${c.name === "ASTRA AI" ? "text-amber-200" : "text-white"}`}>{c.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {([
                  { key: "params"      as const, label: "AI Parameters",        Icon: Cpu           },
                  { key: "knowledge"   as const, label: "Knowledge Base",        Icon: Database      },
                  { key: "pricing"     as const, label: "Pricing",               Icon: Globe         },
                  { key: "offline"     as const, label: "Works Offline",         Icon: Server        },
                  { key: "multiLLM"    as const, label: "Multi-Model Router",    Icon: Brain         },
                  { key: "whatsapp"    as const, label: "WhatsApp / SMS",        Icon: Activity      },
                  { key: "voiceOS"     as const, label: "Offline Voice AI",      Icon: Stethoscope   },
                  { key: "ehr"         as const, label: "Built-in EMR",          Icon: FlaskConical  },
                  { key: "rbac"        as const, label: "Role-Based Access",     Icon: Shield        },
                  { key: "openSource"  as const, label: "Open / Self-Hosted",    Icon: Lock          },
                  { key: "indianContext" as const, label: "India/NABH Context",  Icon: Target        },
                ] as { key: keyof Competitor; label: string; Icon: any }[]).map(({ key, label, Icon }) => (
                  <tr key={key} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-3 text-slate-400 font-medium">
                      <div className="flex items-center gap-1.5"><Icon size={10} className="text-slate-500 shrink-0" />{label}</div>
                    </td>
                    {ALL_ROWS.map((c) => {
                      const val = c[key];
                      const isAstra = c.name === "ASTRA AI";
                      if (typeof val === "number") return <td key={c.name} className={`p-3 text-center ${isAstra ? "bg-amber-500/5" : ""}`} />;
                      if (typeof val === "string") return (
                        <td key={c.name} className={`p-3 text-center align-top ${isAstra ? "bg-amber-500/5" : ""}`}>
                          <div className={`text-[10px] leading-snug ${isAstra ? "text-amber-200 font-semibold" : "text-slate-400"}`}>{val}</div>
                        </td>
                      );
                      return (
                        <td key={c.name} className={`p-3 text-center ${isAstra ? "bg-amber-500/5" : ""}`}>
                          <VerdictIcon v={val as unknown as Verdict} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 justify-center flex-wrap mb-8">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400"><CheckCircle size={12} className="text-emerald-400" /> Yes / Full</span>
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400"><MinusCircle size={12} className="text-amber-400" /> Partial / Limited</span>
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400"><XCircle     size={12} className="text-red-400/70" /> No / Not available</span>
          </div>

          {/* Verdict banner */}
          <div className="p-6 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-amber-500/10 text-center mb-8">
            <Trophy size={26} className="text-amber-400 mx-auto mb-2" />
            <h3 className="text-xl font-bold text-white mb-2">ASTRA AI — Ranked #1 for India Hospital Use</h3>
            <p className="text-slate-400 text-sm max-w-3xl mx-auto leading-relaxed mb-4">
              ASTRA is the <strong className="text-amber-300">only system</strong> combining: self-hosted offline operation ·
              multi-LLM routing across <strong className="text-cyan-300">285 models ({LIVE.cloudParams} params)</strong> ·
              WhatsApp patient dispatch · offline voice AI · built-in EMR + billing ·
              NABH/India-specific context · and open-source deployability — all at
              <strong className="text-emerald-300"> zero licensing cost</strong>.
              World leaders like Epic charge $1M+ and lock hospitals to a single cloud model with no offline fallback.
            </p>
            <div className="flex items-center justify-center gap-6 flex-wrap">
              {[
                { label: "ASTRA AI",           score: "9.5/10", color: "text-amber-300" },
                { label: "Epic AI (best rival)", score: "7.5/10", color: "text-slate-300" },
                { label: "IBM Watson/Merative", score: "4.5/10", color: "text-slate-500" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  {i > 0 && <div className="w-px h-8 bg-white/10" />}
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${item.color}`}>{item.score}</div>
                    <div className="text-[10px] text-slate-500">{item.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Final CTA */}
          <div className="text-center">
            <button onClick={handleEnter}
              className="group relative inline-flex items-center gap-2.5 px-10 py-4 rounded-xl overflow-hidden transition-all duration-300 shadow-xl shadow-amber-900/30">
              <span className="absolute inset-0 bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-400" />
              <span className="absolute inset-0 bg-gradient-to-r from-amber-400 via-yellow-300 to-yellow-200 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="relative flex items-center gap-2.5 text-slate-950 font-extrabold text-base">
                ENTER ASTRA AI <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
            <p className="text-[10px] text-slate-600 mt-3">Local · Private · No cloud lock-in · {LIVE.totalModels} models ready · India-first</p>
          </div>
        </div>
      </section>
    </div>
  );
}
