import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/app/App';
import { registerServiceWorker } from './platform/sw-client';
import { requestPersistentStorage } from './platform/storage';
import { applyThemeState, readStoredHint, safeLocalStorage } from './ui/app/theme';
import './ui/styles/tokens.css';
import './ui/styles/base.css';

// First paint follows the last theme this device showed (two words in localStorage), so a light-theme
// user never sees a dark flash while Dexie loads.
applyThemeState(document, readStoredHint(safeLocalStorage()) ?? { theme: 'dark', night: false });

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
void requestPersistentStorage(navigator.storage);
