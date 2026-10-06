import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SLABS, type Tone } from '../slabs';
import { SlabCard } from './SlabCard';
import { BeforeAfter } from './BeforeAfter';
import { BRAND } from './brand';

const TONES: (Tone | 'All')[] = ['All', 'White', 'Black', 'Warm', 'Green'];
const HERO = ['statuario', 'nero-marquina', 'verde-alpi'];

export function Collection({ heading = true }: { heading?: boolean }) {
  const [tone, setTone] = useState<Tone | 'All'>('All');
  const shown = SLABS.filter((s) => tone === 'All' || s.tone === tone);
  return (
    <section className="collection" id="collection" aria-labelledby="collection-title">
      <div className="section-head">
        {heading ? <h2 id="collection-title" className="section-title">The collection</h2> : <h1 id="collection-title" className="section-title">The collection</h1>}
        <div className="chips" role="radiogroup" aria-label="Filter by tone">
          {TONES.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tone === t} className="chip" onClick={() => setTone(t)}>{t}</button>
          ))}
        </div>
      </div>
      <div className="slab-grid">
        {shown.map((s) => <SlabCard key={s.id} slab={s} level={heading ? 3 : 2} />)}
      </div>
    </section>
  );
}

export function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1 className="hero-title">See the slab on your wall before it leaves our yard.</h1>
          <p className="hero-lede">
            Natural marble from Italy and Spain, cut to order. Browse the collection, then try any slab on a photo of your own wall.
          </p>
          <div className="row">
            <Link to="/collection" className="btn btn-light btn-lg">Browse the collection</Link>
            <Link to="/visualize" className="btn btn-outline-light btn-lg">Try it on your wall</Link>
          </div>
        </div>
        <div className="hero-rack" aria-label="Slabs from the collection">
          {HERO.map((id) => {
            const s = SLABS.find((x) => x.id === id)!;
            return (
              // Flex share = real slab width, so all slabs share one scale and always fit.
              <Link key={id} to={`/slab/${id}`} className="hero-slab" style={{ flex: `${s.sizeMm[1]} 1 0` }}>
                {/* Portrait crop of the landscape texture: a slab standing on its short edge. */}
                <img className="hero-slab-face" src={s.thumb} alt="" width={424} height={760} decoding="async"
                  style={{ aspectRatio: `${s.sizeMm[1]} / ${s.sizeMm[0]}` }} />
                <span className="hero-slab-name">{s.name}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <Collection />

      <section className="feature" aria-labelledby="feature-title">
        <div className="feature-copy">
          <h2 id="feature-title" className="section-title">Your wall, in our marble</h2>
          <p className="feature-lede">
            Our visualizer finds your wall in a photo and lays real slabs on it at true size, with the light from your room still falling on the stone.
          </p>
          <ol className="steps">
            <li><span className="steps-n">1</span><div><h3>Photograph the wall</h3><p>Stand back so the whole wall is in the frame. A phone photo is perfect.</p></div></li>
            <li><span className="steps-n">2</span><div><h3>Tap it, or let us find it</h3><p>Furniture, frames and plants stay exactly where they are.</p></div></li>
            <li><span className="steps-n">3</span><div><h3>Swap slabs in a second</h3><p>See how many slabs you need, compare with the wall today, and save the ones you love.</p></div></li>
          </ol>
          <Link to="/visualize" className="btn btn-brass btn-lg">Try it with your photo</Link>
        </div>
        <figure className="feature-visual">
          <BeforeAfter before="/rooms/bedroom.webp" after="/rooms/bedroom-calacatta.webp" alt="The bedroom wall clad in Calacatta Oro" />
          <figcaption>Calacatta Oro on a sample bedroom wall: found, clad and finished by the visualizer in under a minute. Drag to compare.</figcaption>
        </figure>
      </section>

      <section className="trade" aria-labelledby="trade-title">
        <h2 id="trade-title" className="section-title">For architects and builders</h2>
        <div className="trade-grid">
          <div><h3>Project quotes</h3><p>Send us a design from the visualizer and get slabs, cutting and fitting priced together.</p></div>
          <div><h3>Book-matched sets</h3><p>We reserve consecutive slabs from the same block, so veins run on from panel to panel.</p></div>
          <div><h3>Show your clients</h3><p>Save designs in their room and walk them through the options before anything is cut.</p></div>
        </div>
      </section>

      <section className="showroom" id="showroom" aria-labelledby="showroom-title">
        <div>
          <h2 id="showroom-title" className="section-title">Visit the yard</h2>
          <p>Every slab on this site is in stock. Come and choose the exact one, with its own veins, for your wall.</p>
        </div>
        <dl className="showroom-facts">
          <dt>Where</dt><dd>{BRAND.showroom.address}</dd>
          <dt>When</dt><dd>{BRAND.showroom.hours}</dd>
          <dt>Call</dt><dd><a href={`tel:${BRAND.showroom.phone.replace(/\s/g, '')}`}>{BRAND.showroom.phone}</a></dd>
        </dl>
      </section>
    </>
  );
}
