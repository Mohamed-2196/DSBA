import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts (no Google Fonts): Schibsted Grotesk (UI), Newsreader (editorial), JetBrains Mono (code/keys).
import '@fontsource-variable/schibsted-grotesk/wght.css'
import '@fontsource-variable/schibsted-grotesk/wght-italic.css'
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/newsreader/opsz-italic.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './styles/tokens.css'
import './styles/base.css'
import App from './App.jsx'
import { PostHogProvider} from 'posthog-js/react'

const options = {
  api_host: "https://us.i.posthog.com",
}
createRoot(document.getElementById('root')).render(
  <StrictMode>
        <PostHogProvider 
      apiKey={"phc_1CG24f0McOmY0BNlLOPIkTC5rBtRngZzSHq683SkopE"}
      options={options}
    >
    <App />
    </PostHogProvider>
  </StrictMode>,
)
