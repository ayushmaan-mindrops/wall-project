import { useRef } from 'react';

export function PhotoPicker({ onFile, compact = false }: { onFile: (f: File) => void; compact?: boolean }) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = '';
  };
  return (
    <div className={`picker${compact ? ' picker-compact' : ''}`}>
      <button type="button" className="btn btn-primary" onClick={() => camera.current?.click()}>Take photo</button>
      <button type="button" className="btn" onClick={() => library.current?.click()}>
        {compact ? 'Use another photo' : 'Upload photo'}
      </button>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={library} type="file" accept="image/*" hidden onChange={pick} />
    </div>
  );
}
