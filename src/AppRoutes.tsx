import { type ReactNode, Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './site/auth';
import { QuoteProvider } from './site/quote';
import { ConsentProvider } from './site/consent';
import { Layout } from './site/Layout';
import { Collection, Home } from './site/Home';
import { NotFound, SlabPage } from './site/SlabPage';
import { DesignsPage } from './site/DesignsPage';
import { Legal } from './site/Legal';

// The visualizer (models, WebGL, workers) loads only when someone opens it.
const Visualizer = lazy(() => import('./Visualizer'));

/** Providers and routes, shared by the browser entry and the build-time prerender. */
export function App({ router }: { router: (children: ReactNode) => ReactNode }) {
  return router(
    <ConsentProvider>
      <AuthProvider>
        <QuoteProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="collection" element={<div className="page-pad"><Collection heading={false} /></div>} />
              <Route path="slab/:id" element={<SlabPage />} />
              <Route
                path="visualize"
                element={<Suspense fallback={<div className="app-loading">Opening the visualizer…</div>}><Visualizer /></Suspense>}
              />
              <Route path="designs" element={<DesignsPage />} />
              <Route path="privacy" element={<Legal doc="privacy" />} />
              <Route path="terms" element={<Legal doc="terms" />} />
              <Route path="cookies" element={<Legal doc="cookies" />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </QuoteProvider>
      </AuthProvider>
    </ConsentProvider>,
  );
}
