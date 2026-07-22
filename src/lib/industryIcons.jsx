// Line icons for each industry, replacing the emoji that used to live on the
// INDUSTRIES data. Keyed by industry id; unknown ids fall back to a generic
// grid glyph. Uses the same stroke style as lib/icons.jsx.

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
}

const PATHS = {
  // Technology — CPU chip
  tech: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <rect x="10" y="10" width="4" height="4" rx="0.5" />
      <path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3" />
    </>
  ),
  // Finance & Fintech — credit card
  finance: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  // Healthcare — medical cross
  healthcare: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  // Retail & E-commerce — shopping bag
  retail: (
    <>
      <path d="M6 8h12l-1 11a1 1 0 01-1 1H8a1 1 0 01-1-1L6 8z" />
      <path d="M9 8a3 3 0 016 0" />
    </>
  ),
  // Media & Entertainment — clapperboard
  media: (
    <>
      <rect x="3" y="7" width="18" height="12" rx="1.5" />
      <path d="M3 11h18" />
      <path d="M7 7l-1.5 4M12 7l-1.5 4M17 7l-1.5 4" />
    </>
  ),
  // Mobility & Travel — car
  mobility: (
    <>
      <path d="M5 15l1.6-5.2A2 2 0 018.5 8.4h7a2 2 0 011.9 1.4L19 15" />
      <path d="M4 15h16v3H4z" />
      <circle cx="7.5" cy="18" r="1.3" />
      <circle cx="16.5" cy="18" r="1.3" />
    </>
  ),
  // Education — graduation cap
  education: (
    <>
      <path d="M3 9l9-4 9 4-9 4-9-4z" />
      <path d="M7 11v4c0 1.1 2.2 2 5 2s5-.9 5-2v-4" />
      <path d="M21 9v4" />
    </>
  ),
  // Enterprise SaaS — office building
  enterprise: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="1" />
      <path d="M9.5 7h.01M14.5 7h.01M9.5 11h.01M14.5 11h.01M9.5 15h.01M14.5 15h.01" />
      <path d="M10 21v-3h4v3" />
    </>
  ),
  // Food & Beverage — cup
  fnb: (
    <>
      <path d="M6 8h11v6a4 4 0 01-4 4H10a4 4 0 01-4-4V8z" />
      <path d="M17 9h1.5a2 2 0 010 4H17" />
      <path d="M9 3v2M12 3v2" />
    </>
  ),
  // Manufacturing — factory
  manufacturing: (
    <>
      <path d="M3 21V11l5 3.5V11l5 3.5V8l5 3v10H3z" />
      <path d="M7 21v-3M12 21v-3M17 21v-3" />
    </>
  ),
  // Energy & Utilities — lightning bolt
  energy: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />,
  // Agriculture — sprout
  agriculture: (
    <>
      <path d="M12 21v-9" />
      <path d="M12 13c-.5-3-2.8-4.6-6-4.5.2 3.2 2.4 5 6 4.5z" />
      <path d="M12 11c.4-3 2.6-4.6 6-4.5-.2 3.2-2.4 5-6 4.5z" />
    </>
  ),
  // Logistics & Supply — package box
  logistics: (
    <>
      <path d="M3 8l9-4.5L21 8v8l-9 4.5L3 16V8z" />
      <path d="M3 8l9 4.5L21 8M12 12.5V21" />
    </>
  ),
  // Construction & Real Estate — house
  realestate: (
    <>
      <path d="M4 11l8-6 8 6" />
      <path d="M6 10v10h12V10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  // Telecommunications — broadcast tower
  telecom: (
    <>
      <path d="M12 9v12M8.5 21h7" />
      <circle cx="12" cy="7" r="1.2" />
      <path d="M9.2 4.2a4 4 0 015.6 0M6.8 2a7.2 7.2 0 0110.4 0" />
    </>
  ),
  // Government & Public Sector — classical building
  public: (
    <>
      <path d="M3 9l9-5 9 5" />
      <path d="M4 9h16" />
      <path d="M6 9v9M10 9v9M14 9v9M18 9v9" />
      <path d="M4 20h16" />
    </>
  ),
}

const FALLBACK = (
  <>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </>
)

export function IndustryIcon({ id, size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} className={className}>
      {PATHS[id] || FALLBACK}
    </svg>
  )
}
