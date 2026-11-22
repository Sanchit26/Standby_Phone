import { Ornament } from '../../themes/Ornament'
import { useDisplay } from '../../app/contexts'
import { themes, type ThemeId } from '../../themes/types'
import './settings.css'

export function Settings() {
  const { prefs, update } = useDisplay()
  return <section className="workspace-page">
    <header className="page-heading"><h1>Settings</h1></header>
    <div className="workspace-panel settings-panel theme-panel">
      <Ornament />
      <label>
        Theme
        <select value={prefs.theme} onChange={e => update({ theme: e.target.value as ThemeId })}>
          {Object.entries(themes).map(([id, theme]) => <option key={id} value={id}>{theme.name}</option>)}
        </select>
      </label>
    </div>
  </section>
}
