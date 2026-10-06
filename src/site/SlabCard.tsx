import { Link } from 'react-router-dom';
import type { Slab } from '../slabs';

export function SlabCard({ slab, level = 3 }: { slab: Slab; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <article className="slab-card">
      <Link to={`/slab/${slab.id}`} className="slab-card-link">
        {/* Every slab stands in the same frame at true relative size. */}
        <span className="slab-card-frame">
          <img className="slab-card-face" src={slab.thumb} alt="" loading="lazy" decoding="async" width={760} height={424}
            style={{ width: `${(slab.sizeMm[0] / 3200) * 100}%`, aspectRatio: `${slab.sizeMm[0]} / ${slab.sizeMm[1]}` }} />
        </span>
        <Heading className="slab-card-name">{slab.name}</Heading>
      </Link>
      <p className="slab-card-meta">{slab.origin}</p>
      <p className="slab-card-meta">{slab.finish}, {slab.sizeMm[0]} × {slab.sizeMm[1]} mm</p>
      <Link to={`/visualize?slab=${slab.id}`} className="slab-card-try">Try on my wall</Link>
    </article>
  );
}
