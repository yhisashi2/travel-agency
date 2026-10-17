import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import App from './App';
import { initStore } from './lib/store';

registerSW({ immediate: true });
void initStore();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
