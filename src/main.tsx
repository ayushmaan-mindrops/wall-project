import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './AppRoutes';
import './base.css';
import './site/site.css';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App router={(children) => <BrowserRouter>{children}</BrowserRouter>} />
  </StrictMode>
);

// Pages are prerendered at build time (scripts/prerender.mjs); take over that HTML
// instead of re-rendering, so content shows before the JavaScript arrives.
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
