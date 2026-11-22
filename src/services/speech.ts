import { Capacitor, registerPlugin } from '@capacitor/core'

export interface SpeechOptions { voice?: string; rate?: number; volume?: number }
export interface Voice { id: string; name: string }
interface SpeechPlugin {
  voices(): Promise<{ voices: Voice[] }>
  speak(options: SpeechOptions & { id: string; text: string }): Promise<void>
  stop(options: { id: string }): Promise<void>
}

const android = Capacitor.getPlatform() === 'android'
const native = registerPlugin<SpeechPlugin>('StandbySpeech')
const browserVoices = () => window.speechSynthesis?.getVoices().filter(voice => voice.localService) ?? []
export async function availableVoices() {
  if (android) return (await native.voices()).voices
  return browserVoices().map(voice => ({ id: voice.voiceURI, name: voice.name + ' · ' + voice.lang }))
}
export function onVoiceListChange(listener: () => void) {
  if (!android) window.speechSynthesis?.addEventListener('voiceschanged', listener)
  return () => { if (!android) window.speechSynthesis?.removeEventListener('voiceschanged', listener) }
}

export type SpeechResult = { status: 'spoken' | 'silenced' | 'error'; error?: string }
interface SpeechJob { done: Promise<SpeechResult>; stop: () => void }
let active: SpeechJob | undefined

export function startSpeech(text: string, settings: SpeechOptions, started?: () => void, interrupt = false): SpeechJob {
  if (active) {
    if (interrupt) active.stop()
    else return { done: Promise.resolve({ status: 'error', error: 'Another announcement is active.' }), stop: () => {} }
  }
  const id = crypto.randomUUID()
  let resolve!: (result: SpeechResult) => void
  const done = new Promise<SpeechResult>(finish => { resolve = finish })
  let complete = false
  let cancel = () => {}
  function finish(result: SpeechResult) {
    if (complete) return
    complete = true
    clearTimeout(timeout)
    if (active === job) active = undefined
    resolve(result)
  }
  const job = { done, stop: () => { if (!complete) { finish({ status: 'silenced' }); cancel() } } }
  const timeout = window.setTimeout(() => {
    finish({ status: 'error', error: 'Speech engine timed out.' }); cancel()
  }, 120_000)
  active = job
  const error = (reason: unknown) => finish({ status: 'error',
    error: reason instanceof Error ? reason.message : 'Speech is unavailable.' })
  const spoken = () => finish({ status: 'spoken' })
  try {
    if (android) {
      cancel = () => { void native.stop({ id }).catch(console.error) }
      const voice = settings.voice || undefined
      void native.speak({ id, text, voice, rate: settings.rate, volume: settings.volume }).then(spoken, error)
    } else {
      const engine = window.speechSynthesis
      if (!engine || !window.SpeechSynthesisUtterance) throw new Error('Speech synthesis is unavailable in this browser.')
      const voices = browserVoices()
      const voice = settings.voice ? voices.find(v => v.voiceURI === settings.voice)
        : voices.find(v => v.default) ?? voices.find(v => v.lang === navigator.language) ?? voices[0]
      if (!voice) throw new Error('Install or select an offline voice in your device settings.')
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.voice = voice
      utterance.lang = voice.lang
      utterance.rate = settings.rate ?? 1
      utterance.volume = settings.volume ?? 1
      utterance.onstart = () => { if (!complete) started?.() }
      utterance.onend = spoken
      utterance.onerror = event => error(new Error('Speech engine: ' + event.error))
      cancel = () => engine.cancel()
      engine.speak(utterance)
    }
  } catch (reason) { error(reason) }
  return job
}
