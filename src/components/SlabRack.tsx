import type { Slab } from '../slabs';

// Swatches are drawn at true relative size, like slabs leaning on a yard rack.
const PX_PER_M = 34;

export function SlabRack({ slabs, selected, onSelect }: { slabs: Slab[]; selected: Slab; onSelect: (s: Slab) => void }) {
  return (
    <nav className="rack" aria-label="Marble slabs">
      <ul className="rack-row">
        {slabs.map((s) => {
          const on = s.id === selected.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`slab${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => onSelect(s)}
              >
                <span
                  className="slab-face"
                  style={{
                    width: (s.sizeMm[0] / 1000) * PX_PER_M,
                    height: (s.sizeMm[1] / 1000) * PX_PER_M,
                    backgroundImage: `url(${s.thumb})`,
                  }}
                />
                <span className="slab-name">{s.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
