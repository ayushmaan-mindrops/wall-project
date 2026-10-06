import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type SavedDesign, api } from './api';
import { useAuth } from './auth';
import { useQuote } from './quote';
import { slabById } from '../slabs';

export function DesignsPage() {
  const { user, loading, requireUser } = useAuth();
  const quote = useQuote();
  const [designs, setDesigns] = useState<SavedDesign[] | null>(null);

  useEffect(() => {
    if (!user?.complete) return;
    api<{ designs: SavedDesign[] }>('/api/designs').then((r) => setDesigns(r.designs)).catch(() => setDesigns([]));
  }, [user]);

  if (loading) return <section className="designs" />;
  if (!user?.complete) {
    return (
      <section className="designs designs-empty">
        <h1 className="section-title">Your designs</h1>
        <p>Sign in to see the walls you've saved.</p>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => requireUser('Sign in to see your saved designs.')}>Sign in</button>
      </section>
    );
  }

  const remove = async (id: string) => {
    await api(`/api/designs/${id}`, undefined, 'DELETE');
    setDesigns((d) => d?.filter((x) => x.id !== id) ?? null);
  };

  return (
    <section className="designs">
      <div className="section-head">
        <h1 className="section-title">Your designs</h1>
        <Link to="/visualize" className="btn btn-brass">Start a new design</Link>
      </div>
      {designs && designs.length === 0 && (
        <div className="designs-empty">
          <p>Nothing saved yet. Try a slab on a photo of your wall, then press Save design.</p>
          <Link to="/visualize" className="btn btn-primary btn-lg">See it on your wall</Link>
        </div>
      )}
      <div className="design-grid">
        {designs?.map((d) => {
          const slab = slabById(d.slab_id);
          const src = `/api/designs/${d.id}/image`;
          return (
            <article key={d.id} className="design-card">
              <img src={src} alt={`${slab?.name ?? 'Marble'} on your wall`} loading="lazy" />
              <div className="design-card-body">
                <h2 className="design-card-name">{slab?.name ?? d.slab_id}</h2>
                <p className="design-card-meta">
                  {d.kind === 'ai' ? 'AI finish' : 'Exact slab'}
                  {d.area_m2 ? `, ${d.area_m2.toFixed(1)} m²` : ''}
                  {d.slabs ? `, about ${d.slabs} slabs` : ''}
                </p>
                <p className="design-card-date">{new Date(d.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                <div className="row">
                  <button type="button" className="btn btn-primary" onClick={() => quote({ slabId: d.slab_id, areaM2: d.area_m2, slabs: d.slabs, designId: d.id, image: src })}>Get a quote</button>
                  <a className="btn" href={src} download={`${d.slab_id}-design.jpg`}>Download</a>
                  <button type="button" className="btn btn-quiet" onClick={() => remove(d.id)}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
