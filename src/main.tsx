import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/app/App';
import { registerServiceWorker } from './platform/sw-client';
import { requestPersistentStorage } from './platform/storage';
import './ui/app/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
void requestPersistentStorage(navigator.storage);
