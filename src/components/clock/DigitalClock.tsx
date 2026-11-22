import { useMemo } from 'react'
import { useClock } from '../../hooks/useClock'
import type { ClockDisplay } from './registry'
import { Glyphs } from './Glyphs'
import './faces.css'

type Props = ClockDisplay & { now?: Date }
type Style = 'modern' | 'thin' | 'led' | 'flip' | 'pixel' | 'terminal' | 'outline' | 'serif'

function Face({ now, format, seconds, accent, style }: Props & { now: Date; style: Style }) {
  const drawn = style === 'pixel' || style === 'led'
  const formatter = useMemo(() => new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined,
    hourCycle: format === '24h' ? 'h23' : format === '12h' ? 'h12' : undefined,
    numberingSystem: drawn ? 'latn' : undefined,
  }), [drawn, format, seconds])
  const parts = formatter.formatToParts(now)
  const hours = parts.find(part => part.type === 'hour')?.value ?? '00'
  const minutes = parts.find(part => part.type === 'minute')?.value ?? '00'
  const detail = parts.filter(part => part.type === 'second' || part.type === 'dayPeriod').map(part => part.value)
  const zero = new Intl.NumberFormat(formatter.resolvedOptions().locale, { numberingSystem: formatter.resolvedOptions().numberingSystem }).format(0)
  const digits = [hours, minutes].map(value => Array.from(value).length === 1 ? zero + value : value).join(':')

  return <time dateTime={now.toISOString()} aria-label={formatter.format(now)} className={`clock face-${style}`}
    data-accent={style === 'flip' ? 'default' : accent}>
    <span aria-hidden="true" className="clock-digits">
      {drawn ? <Glyphs value={digits} pixel={style === 'pixel'} /> :
        style === 'flip' ? Array.from(digits, (char, index) =>
          <span key={index} className={char === ':' ? 'flip-colon' : 'flip-tile'}>
            <span key={char}>{char}</span>
          </span>) : digits}
    </span>
    {detail.length > 0 && <span aria-hidden="true" className="clock-detail">{detail.join(' · ')}</span>}
  </time>
}

function LiveFace(props: ClockDisplay & { style: Style }) {
  const now = useClock()
  return <Face {...props} now={now} />
}

function ClockFace(props: Props & { style: Style }) {
  return props.now ? <Face {...props} now={props.now} /> : <LiveFace {...props} />
}

export function Modern(props: Props) {
  return <ClockFace {...props} style="modern" />
}

export function Thin(props: Props) {
  return <ClockFace {...props} style="thin" />
}

export function LED(props: Props) {
  return <ClockFace {...props} style="led" />
}

export function Flip(props: Props) {
  return <ClockFace {...props} style="flip" />
}

export function Pixel(props: Props) {
  return <ClockFace {...props} style="pixel" />
}

export function Terminal(props: Props) {
  return <ClockFace {...props} style="terminal" />
}

export function Outline(props: Props) {
  return <ClockFace {...props} style="outline" />
}

export function Serif(props: Props) {
  return <ClockFace {...props} style="serif" />
}
