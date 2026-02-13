import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const ADMIN_PASS = 'geluidskleur';

const entered = prompt('Admin wachtwoord:');
if (entered === ADMIN_PASS) {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} else {
  document.getElementById('root').innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#888">Geen toegang</div>';
}
