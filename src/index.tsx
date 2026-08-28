import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import './data/resonantInit';
import './systems/sound/ResonantVaultAudio';
import { initializePixelation } from './systems/graphics/pixelation';
import { initializeRetroEffects } from './systems/graphics/retroEffects';
import App from './App';

initializePixelation();
initializeRetroEffects();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
