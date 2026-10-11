import { useEffect } from 'react'
import { app, initApp } from './state/app'
import { TopBar } from './screens/TopBar'
import { Onboarding } from './screens/Onboarding'
import { Lobby } from './screens/Lobby'
import { EditorScreen } from './screens/EditorScreen'
import { PlazaScreen } from './screens/PlazaScreen'
import { CallPrompt } from './screens/CallPrompt'
import { Composer } from './screens/Composer'
import { SettingsModal } from './screens/SettingsModal'
import { Toasts } from './ui/Toasts'
import './screens/screens.css'

export function App(): React.JSX.Element {
  const viewName = app.use((s) => s.view)
  const composer = app.use((s) => s.composer)
  const settingsOpen = app.use((s) => s.settingsOpen)

  useEffect(() => {
    void initApp()
  }, [])

  return (
    <div className={'app app-' + viewName + (window.api.platform === 'darwin' ? ' mac' : '')}>
      <TopBar />
      <main className="app-main">
        {viewName === 'onboarding' && <Onboarding />}
        {viewName === 'lobby' && <Lobby />}
        {viewName === 'editor' && <EditorScreen />}
        {viewName === 'plaza' && <PlazaScreen />}
      </main>
      <CallPrompt />
      {composer && <Composer target={composer} />}
      {settingsOpen && <SettingsModal />}
      <Toasts />
    </div>
  )
}
