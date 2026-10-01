import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
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
