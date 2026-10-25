import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, Activity, Brain, BrainCircuit, AlertTriangle, Download, Hourglass, CheckCircle2, Pause, Sparkles, GitBranch } from "lucide-react";
import type { MayinState } from "./core/MayinTypes";

interface MayinBrainCoreProps {
  state: MayinState;
  listening: boolean;
  processing: boolean;
}

export function MayinBrainCore({ state, listening, processing }: MayinBrainCoreProps) {
  const brainRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLDivElement>(null);

  // Create neural particles on mount
  useEffect(() => {
    if (!particlesRef.current) return;

    const particles: HTMLDivElement[] = [];
    const particleCount = 50;

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement("div");
      particle.className = "absolute rounded-full bg-emerald-400/30";
      particle.style.width = "4px";
      particle.style.height = "4px";
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.top = `${Math.random() * 100}%`;
      particle.style.opacity = "0";
      particlesRef.current.appendChild(particle);
      particles.push(particle);
    }

    // Animate particles based on state
    const animateParticles = () => {
      particles.forEach((particle, i) => {
        const x = Math.sin(Date.now() / 1000 + i) * 20 + 50;
        const y = Math.cos(Date.now() / 1000 + i) * 20 + 50;
        const scale = 1 + Math.sin(Date.now() / 500 + i) * 0.5;
        const opacity = 0.3 + Math.sin(Date.now() / 800 + i) * 0.2;

        particle.style.transform = `translate(${x}%, ${y}%) scale(${scale})`;
        particle.style.opacity = opacity.toString();
      });

      requestAnimationFrame(animateParticles);
    };

    animateParticles();

    return () => {
      particles.forEach(p => p.remove());
    };
  }, []);

  // State-specific animations
  const getCoreAnimation = () => {
    switch (state) {
      case "listening":
        return {
          scale: [1, 1.05, 1],
          transition: {
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut"
          }
        };
      case "thinking":
      case "analysing":
      case "understanding":
      case "comparing":
        return {
          rotate: [0, 5, -5, 0],
          transition: {
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }
        };
      case "retrieving":
        return {
          scale: [1, 1.03, 1],
          transition: { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
        };
      case "waiting":
      case "dispatching":
        return {
          scale: [1, 1.02, 1],
          transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
        };
      case "complete":
      case "task-complete":
        return {
          scale: [1, 1.06, 1],
          transition: { duration: 0.6, repeat: 1, ease: "easeOut" }
        };
      case "paused":
        return { scale: 1, rotate: 0 };
      case "critical":
        return {
          scale: [1, 1.08, 1],
          transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
        };
      case "speaking":
        return {
          scale: [1, 1.1, 1],
          transition: {
            duration: 1,
            repeat: Infinity,
            ease: "easeInOut"
          }
        };
      case "attention":
        return {
          scale: [1, 1.2, 1],
          backgroundColor: ["#1e293b", "#0d9488", "#1e293b"],
          transition: {
            duration: 0.5,
            repeat: Infinity,
            ease: "easeInOut"
          }
        };
      default:
        return {
          scale: 1,
          rotate: 0,
          backgroundColor: "#1e293b"
        };
    }
  };

  // State-specific icons
  const getStateIcon = () => {
    switch (state) {
      case "listening":
        return <Mic className="w-8 h-8 text-emerald-400" />;
      case "wake":
        return <Sparkles className="w-8 h-8 text-emerald-300" />;
      case "understanding":
        return <Brain className="w-8 h-8 text-teal-300" />;
      case "thinking":
        return <Brain className="w-8 h-8 text-emerald-400" />;
      case "retrieving":
        return <Download className="w-8 h-8 text-sky-400" />;
      case "analysing":
        return <Activity className="w-8 h-8 text-emerald-400" />;
      case "comparing":
        return <GitBranch className="w-8 h-8 text-teal-400" />;
      case "speaking":
        return <MicOff className="w-8 h-8 text-emerald-400" />;
      case "waiting":
      case "dispatching":
        return <Hourglass className="w-8 h-8 text-amber-300" />;
      case "complete":
      case "task-complete":
        return <CheckCircle2 className="w-8 h-8 text-emerald-400" />;
      case "paused":
        return <Pause className="w-8 h-8 text-slate-300" />;
      case "critical":
        return <AlertTriangle className="w-8 h-8 text-red-400" />;
      case "attention":
        return <AlertTriangle className="w-8 h-8 text-amber-400" />;
      default:
        return <BrainCircuit className="w-8 h-8 text-emerald-400" />;
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Neural particles background */}
      <div ref={particlesRef} className="absolute inset-0" />

      {/* Core visualization */}
      <motion.div
        ref={brainRef}
        className="relative w-48 h-48 rounded-full bg-slate-800/30 border border-emerald-400/20 flex items-center justify-center shadow-lg shadow-emerald-500/20"
        animate={getCoreAnimation()}
      >
        {/* Core icon */}
        <div className="absolute z-10">
          {getStateIcon()}
        </div>

        {/* Rotating ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-emerald-400/30"
          animate={{
            rotate: 360,
            transition: {
              duration: 20,
              repeat: Infinity,
              ease: "linear"
            }
          }}
        />

        {/* Inner lattice */}
        <div className="absolute w-32 h-32 rounded-full border border-emerald-400/20">
          <div className="absolute inset-0 grid grid-cols-4 grid-rows-4">
            {[...Array(16)].map((_, i) => (
              <motion.div
                key={i}
                className="w-1 h-1 rounded-full bg-emerald-400/50"
                animate={{
                  opacity: [0.3, 0.7, 0.3],
                  scale: [0.8, 1.2, 0.8],
                  transition: {
                    duration: 2,
                    delay: i * 0.1,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }
                }}
              />
            ))}
          </div>
        </div>
      </motion.div>

      {/* State label */}
      <div className="absolute bottom-4 text-sm font-medium uppercase tracking-wider text-emerald-300">
        {state.replace(/[-_]/g, " ")}
      </div>
    </div>
  );
}

export default MayinBrainCore;