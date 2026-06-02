// Renders a decorative background for a slide based on the deck's gradient + pattern.

const Pattern = ({ pattern }) => {
  if (pattern === 'orbs') {
    return (
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="orb-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        <circle cx="15%" cy="20%" r="200" fill="url(#orb-glow)" />
        <circle cx="85%" cy="80%" r="240" fill="url(#orb-glow)" />
        <circle cx="60%" cy="10%" r="120" fill="url(#orb-glow)" opacity="0.5" />
      </svg>
    )
  }
  if (pattern === 'grid') {
    return (
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
    )
  }
  if (pattern === 'wave') {
    return (
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1000 600"
        preserveAspectRatio="none"
      >
        <path
          d="M0,400 Q250,300 500,400 T1000,400 L1000,600 L0,600 Z"
          fill="rgba(255,255,255,0.08)"
        />
        <path
          d="M0,460 Q250,360 500,460 T1000,460 L1000,600 L0,600 Z"
          fill="rgba(255,255,255,0.06)"
        />
      </svg>
    )
  }
  if (pattern === 'rays') {
    return (
      <svg
        className="absolute inset-0 w-full h-full opacity-30"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
      >
        {Array.from({ length: 18 }).map((_, i) => (
          <line
            key={i}
            x1="50"
            y1="50"
            x2={50 + Math.cos((i / 18) * Math.PI * 2) * 200}
            y2={50 + Math.sin((i / 18) * Math.PI * 2) * 200}
            stroke="white"
            strokeWidth="0.4"
          />
        ))}
      </svg>
    )
  }
  return null
}

export default function SlideBackground({ gradient, pattern, className = '' }) {
  if (!gradient) gradient = { from: '#222', to: '#111' }
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(135deg, ${gradient.from} 0%, ${gradient.to} 100%)`,
        }}
      />
      <Pattern pattern={pattern} />
      <div className="absolute inset-0 bg-black/10" />
    </div>
  )
}
