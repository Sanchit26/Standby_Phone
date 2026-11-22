import { Ornament } from '../../themes/Ornament'
import { useDisplay } from '../../app/contexts'
import { themes, type ThemeId } from '../../themes/types'

export function Settings() {
  const { prefs, update } = useDisplay()
  return <section className="theme-utility theme-panel"><Ornament /><h1>Settings</h1>
    <label>Theme <select value={prefs.theme} onChange={e => update({ theme: e.target.value as ThemeId })}>
      {Object.entries(themes).map(([id, theme]) => <option key={id} value={id}>{theme.name}</option>)}
    </select></label>
  </section>
}
