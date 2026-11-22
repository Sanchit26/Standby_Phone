import { pixelGlyphs } from './pixelGlyphs'

const segments = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg']
const shapes = [
  '1,0 4,0 4.6,.5 4,1 1,1 .4,.5',
  '4.5,.7 5,1.2 5,3 4.5,3.45 4,3 4,1.2',
  '4.5,3.55 5,4 5,5.8 4.5,6.3 4,5.8 4,4',
  '1,6 4,6 4.6,6.5 4,7 1,7 .4,6.5',
  '.5,3.55 1,4 1,5.8 .5,6.3 0,5.8 0,4',
  '.5,.7 1,1.2 1,3 .5,3.45 0,3 0,1.2',
  '1,3 4,3 4.6,3.5 4,4 1,4 .4,3.5',
]

export function Glyphs({ value, pixel }: { value: string; pixel: boolean }) {
  if (pixel) return <svg viewBox="0 0 81 22" fill="currentColor" aria-hidden="true" shapeRendering="crispEdges">
    {Array.from(value, (char, index) => {
      const x = index * 18 - (index > 2 ? 7 : 0)
      return <g key={index} transform={`translate(${x},0)`}>
        {char === ':' ? <path d="M3 6h5v4H3z M3 13h5v4H3z" /> :
          <path d={pixelGlyphs[Number(char)]} fillRule="evenodd" />}
      </g>
    })}
  </svg>

  return <svg viewBox="0 0 27 7" fill="currentColor" aria-hidden="true">
    {Array.from(value, (char, index) => {
      const x = index * 6 - (index > 2 ? 2 : 0)
      if (char === ':') return <g key={index} transform={`translate(${x},0)`}>
        <rect x=".5" y="2" width="1.5" height="1" /><rect x=".5" y="4" width="1.5" height="1" />
      </g>
      const digit = Number(char)
      return <g key={index} transform={`translate(${x},0)`}>
        {shapes.map((shape, segment) => <polygon key={segment} points={shape}
            opacity={segments[digit]?.includes('abcdefg'[segment]) ? 1 : .1} />)}
      </g>
    })}
  </svg>
}
