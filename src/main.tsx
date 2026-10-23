import { loadAppearance, setAppearance } from './appearance.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import RecoveryBoundary from './RecoveryBoundary';
import './styles.css';
import './redesign.css';
import './polish.css';
import './appearance.css';
import './library/library.css';
import { hydrateWorkspace } from './storage';
import { fontFaceCss } from './fonts.js';
setAppearance(loadAppearance());
const bundledFontFaces = document.createElement('style');
bundledFontFaces.id = 'reframe-bundled-fonts';
bundledFontFaces.textContent = fontFaceCss();
document.head.append(bundledFontFaces);
void hydrateWorkspace().then(() =>
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <RecoveryBoundary>
        <App />
      </RecoveryBoundary>
    </React.StrictMode>,
  ),
);
