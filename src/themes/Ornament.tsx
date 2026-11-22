import { useDisplay } from '../app/contexts'

const corners = ['north-west', 'north-east', 'south-west', 'south-east'] as const

function Corner({ position }: { position: typeof corners[number] }) {
  return <svg className={`ornament-corner ${position}`} viewBox="0 0 32 32" fill="none">
    <path d="M1 30V7h3V4h3V1h23 M4 22V11h3V7h4V4h11" className="ornament-base" />
    <path d="M1 13V7h3V4h3V1h6 M4 22v-5 M17 4h5" className="ornament-light" />
    <path d="m10 6 4 4-4 4-4-4z" className="ornament-light" />
    <path d="M16 1h3M1 16v3M10 9h1v2h-1z" className="ornament-pixel" />
  </svg>
}

function Crest({ edge }: { edge: 'top' | 'bottom' }) {
  return <svg className={`ornament-crest ${edge}`} viewBox="0 0 64 16" fill="none">
    <path d="M1 15h13l5-4h6l7-9 7 9h6l5 4h13 M20 15l6-5m18 5-6-5" className="ornament-base" />
    <path d="m32 5 4 5-4 5-4-5z M12 14h5l4-4m31 4h-5l-4-4" className="ornament-light" />
    <path d="M31 9h2v2h-2z M24 13h2v2h-2z M38 13h2v2h-2z" className="ornament-pixel" />
  </svg>
}

/** A theme-only decorative layer. Its host supplies the geometry. */
export function Ornament({ variant = 'panel', crest = 'none' }: {
  variant?: 'screen' | 'brackets' | 'panel'
  crest?: 'none' | 'top' | 'bottom' | 'both'
}) {
  const { prefs } = useDisplay()
  if (prefs.theme !== 'dark-fantasy-rpg') return null
  return <span className={`theme-ornament ornament-${variant}`} aria-hidden="true">
    {corners.map(position => <Corner key={position} position={position} />)}
    {(crest === 'top' || crest === 'both') && <Crest edge="top" />}
    {(crest === 'bottom' || crest === 'both') && <Crest edge="bottom" />}
  </span>
}
