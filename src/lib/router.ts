import { useEffect, useState } from 'react';

/** ハッシュルーティング（GitHub Pages でもリロードで 404 にならない） */
export function useRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(...parts: string[]) {
  location.hash = '/' + parts.map(encodeURIComponent).join('/');
}
