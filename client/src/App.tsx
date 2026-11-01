import { useEffect, useState } from 'react';
import { Home } from './screens/Home.tsx';
import { RoomPage } from './screens/RoomPage.tsx';

function roomCode(path: string): string | null {
  const match = path.match(/^\/r\/([A-Za-z0-9]{6})\/?$/);
  return match ? match[1].toUpperCase() : null;
}

export function navigate(path: string): void {
  history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function App() {
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const code = roomCode(path);
  return code ? <RoomPage key={code} code={code} /> : <Home />;
}
