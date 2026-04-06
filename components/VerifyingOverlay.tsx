"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { label: "Verifying address...",       duration: 600 },
  { label: "Checking phone carrier...",  duration: 700 },
  { label: "Validating email...",        duration: 500 },
  { label: "Running card check...",      duration: 800 },
  { label: "Scoring IP location...",     duration: 400 },
  { label: "Running identity check...",  duration: 900 },
  { label: "Checking property records...", duration: 700 },
  { label: "Calculating risk score...", duration: 600 },
];

export function VerifyingOverlay({ visible }: { visible: boolean }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (!visible) {
      setStepIndex(0);
      setProgress(0);
      return;
    }

    // Animate through steps
    let i = 0;
    let elapsed = 0;
    const totalDuration = STEPS.reduce((s, st) => s + st.duration, 0);

    const advance = () => {
      if (i >= STEPS.length) return;
      setStepIndex(i);
      elapsed += STEPS[i].duration;
      setProgress(Math.min(95, Math.round((elapsed / totalDuration) * 100)));
      i++;
      if (i < STEPS.length) {
        timer = setTimeout(advance, STEPS[i - 1].duration);
      }
    };

    let timer = setTimeout(advance, 0);
    return () => clearTimeout(timer);
  }, [visible]);

  // Animate dots
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? "" : d + ".");
    }, 400);
    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(15, 22, 35, 0.92)", backdropFilter: "blur(4px)" }}>
      <div className="flex flex-col items-center gap-8 px-8 py-10 rounded-2xl"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", minWidth: 340 }}>

        {/* Pulsing logo */}
        <div className="relative flex items-center justify-center">
          {/* Outer ring */}
          <div className="absolute rounded-full animate-ping"
            style={{
              width: 180, height: 180,
              background: "radial-gradient(circle, rgba(204,17,17,0.15), transparent 70%)",
              animationDuration: "1.5s",
            }} />
          {/* Inner glow */}
          <div className="absolute rounded-full"
            style={{
              width: 160, height: 160,
              background: "radial-gradient(circle, rgba(30,58,138,0.2), transparent 70%)",
            }} />
          {/* Logo */}
          <img
            src="/acwg-logo.webp"
            alt="ACWG"
            className="relative z-10"
            style={{
              width: 200,
              filter: "drop-shadow(0 0 20px rgba(204,17,17,0.5)) drop-shadow(0 0 40px rgba(30,58,138,0.3))",
              animation: "acwgPulse 1.5s ease-in-out infinite",
            }}
          />
        </div>

        {/* Step label */}
        <div className="text-center space-y-1">
          <p className="text-white font-semibold text-base tracking-wide">
            {STEPS[Math.min(stepIndex, STEPS.length - 1)].label.replace("...", "")}{dots}
          </p>
          <p className="text-slate-400 text-xs">Running fraud verification</p>
        </div>

        {/* Progress bar */}
        <div className="w-full space-y-2">
          <div className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.1)" }}>
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #cc1111, #1e3a8a)",
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Analyzing signals</span>
            <span>{progress}%</span>
          </div>
        </div>

        {/* Step dots */}
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className="rounded-full transition-all duration-300"
              style={{
                width: i === stepIndex ? 20 : 6,
                height: 6,
                background: i < stepIndex ? "#cc1111"
                  : i === stepIndex ? "linear-gradient(90deg, #cc1111, #1e3a8a)"
                  : "rgba(255,255,255,0.15)",
              }} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes acwgPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
