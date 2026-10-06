import { useState } from 'react';

/** Drag (or use arrow keys) to compare a room before and after. */
export function BeforeAfter({ before, after, alt }: { before: string; after: string; alt: string }) {
  const [pos, setPos] = useState(55);
  return (
    <div className="ba">
      <img src={before} alt="" className="ba-img" width={1200} height={896} loading="lazy" decoding="async" />
      <img src={after} alt={alt} className="ba-img ba-after" width={1200} height={896} loading="lazy" decoding="async" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
      <span className="ba-line" style={{ left: `${pos}%` }} aria-hidden="true"><span /></span>
      <span className="ba-tag ba-tag-left">With marble</span>
      <span className="ba-tag ba-tag-right">Today</span>
      <input
        className="ba-range" type="range" min={0} max={100} value={pos}
        aria-label="Compare the room with and without marble"
        onChange={(e) => setPos(Number(e.target.value))}
      />
    </div>
  );
}
