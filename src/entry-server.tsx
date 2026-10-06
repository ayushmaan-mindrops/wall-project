// Build-time entry: renders a route to HTML for scripts/prerender.mjs.
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { App } from './AppRoutes';

export { allPages, notFoundMeta } from './site/meta';

export function render(url: string): string {
  return renderToString(
    <StrictMode>
      <App router={(children) => <StaticRouter location={url}>{children}</StaticRouter>} />
    </StrictMode>,
  );
}
