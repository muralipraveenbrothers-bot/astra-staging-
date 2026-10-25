import { cn } from "@/lib/utils";

/**
 * Astra AI avatar — golden lotus-petal base, crystalline brain with flowing
 * cyan neural pathways, heartbeat pulse.
 * States: idle (slow breath) / thinking (rapid pulse + wave rings) / speaking.
 */
export function AvatarOrb({
  size = 44,
  thinking = false,
  speaking = false,
}: {
  size?: number;
  thinking?: boolean;
  speaking?: boolean;
}) {
  const pulseDur = thinking ? "0.9s" : speaking ? "1.3s" : "3.2s";

  const petals = Array.from({ length: 8 }, (_, i) => i * 45);

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-label="Astra AI"
    >
      {/* lotus-petal base glow */}
      <svg width={size} height={size} viewBox="0 0 100 100" className="absolute inset-0">
        <defs>
          <radialGradient id="sh-core" cx="42%" cy="36%" r="70%">
            <stop offset="0%" stopColor="#39d5ff" stopOpacity="0.9" />
            <stop offset="45%" stopColor="#12343c" />
            <stop offset="100%" stopColor="#0b1d20" />
          </radialGradient>
          <linearGradient id="sh-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#b8932c" />
            <stop offset="55%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#f5d97e" />
          </linearGradient>
        </defs>
        {petals.map((a) => (
          <ellipse
            key={a}
            cx="50"
            cy="34"
            rx="9"
            ry="20"
            fill="url(#sh-gold)"
            opacity="0.28"
            transform={`rotate(${a} 50 50)`}
          />
        ))}
      </svg>

      {/* heartbeat halo */}
      <div
        className="absolute rounded-full animate-breathe"
        style={{
          inset: size * 0.1,
          border: "1px solid rgba(212,175,55,0.55)",
          boxShadow: "0 0 16px rgba(212,175,55,0.45), inset 0 0 12px rgba(57,213,255,0.18)",
          animationDuration: pulseDur,
        }}
      />
      {thinking && (
        <div
          className="absolute rounded-full animate-ping"
          style={{ inset: size * 0.06, border: "1.5px solid rgba(245,217,126,0.6)", animationDuration: "1.1s" }}
        />
      )}

      {/* crystalline brain */}
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 100 100"
        className={cn("relative animate-breathe")}
        style={{ animationDuration: pulseDur, filter: "drop-shadow(0 0 8px rgba(57,213,255,0.5))" }}
      >
        <polygon
          points="50,8 74,20 88,44 80,72 58,90 34,84 16,62 20,34 36,16"
          fill="url(#sh-core)"
          stroke="url(#sh-gold)"
          strokeWidth="2.5"
        />
        {/* neural pathways */}
        <g stroke="#39d5ff" strokeWidth="1.6" opacity={thinking ? 1 : 0.65}>
          <line x1="50" y1="50" x2="74" y2="20" />
          <line x1="50" y1="50" x2="88" y2="44" />
          <line x1="50" y1="50" x2="58" y2="90" />
          <line x1="50" y1="50" x2="16" y2="62" />
          <line x1="50" y1="50" x2="36" y2="16" />
        </g>
        <circle cx="50" cy="50" r="5" fill="#f5d97e" />
      </svg>
    </div>
  );
}
