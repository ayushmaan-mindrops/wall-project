import { Link, useParams } from 'react-router-dom';
import { SLABS, slabById } from '../slabs';
import { SlabCard } from './SlabCard';
import { useQuote } from './quote';

export function SlabPage() {
  const { id } = useParams();
  const slab = slabById(id);
  const quote = useQuote();
  if (!slab) return <NotFound />;
  const related = SLABS.filter((s) => s.id !== slab.id).sort((a, b) => Number(b.tone === slab.tone) - Number(a.tone === slab.tone)).slice(0, 3);

  return (
    <>
      <article className="slab-page">
        <nav className="crumbs" aria-label="Breadcrumb"><Link to="/collection">Collection</Link><span aria-hidden="true">/</span><span>{slab.name}</span></nav>
        <div className="slab-page-grid">
          <img className="slab-page-face" src={slab.large} alt={`${slab.name} marble slab`} width={1400} height={781}
            fetchPriority="high" style={{ aspectRatio: `${slab.sizeMm[0]} / ${slab.sizeMm[1]}` }} />
          <div className="slab-page-info">
            <h1 className="slab-page-name">{slab.name}</h1>
            <p className="slab-page-desc">{slab.description}</p>
            <dl className="spec">
              <dt>Quarry</dt><dd>{slab.origin}</dd>
              <dt>Finish</dt><dd>{slab.finish}</dd>
              <dt>Slab size</dt><dd>{slab.sizeMm[0]} × {slab.sizeMm[1]} mm</dd>
              <dt>Thickness</dt><dd>{slab.thicknessMm.join(', ')} mm</dd>
              <dt>Tone</dt><dd>{slab.tone}</dd>
            </dl>
            <div className="row">
              <Link to={`/visualize?slab=${slab.id}`} className="btn btn-brass btn-lg">See it on your wall</Link>
              <button type="button" className="btn btn-lg" onClick={() => quote({ slabId: slab.id })}>Request a quote</button>
            </div>
            <p className="fineprint">Every slab is unique. The one you choose at the yard will have its own veins.</p>
          </div>
        </div>
      </article>
      <section className="related" aria-labelledby="related-title">
        <h2 id="related-title" className="section-title">You might also like</h2>
        <div className="slab-grid">{related.map((s) => <SlabCard key={s.id} slab={s} />)}</div>
      </section>
    </>
  );
}

export function NotFound() {
  return (
    <section className="notfound">
      <h1 className="section-title">That page isn't here</h1>
      <p>It may have moved, or the link may be mistyped.</p>
      <Link to="/collection" className="btn btn-primary">Browse the collection</Link>
    </section>
  );
}
