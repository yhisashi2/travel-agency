import { useRoute } from './lib/router';
import { useStore } from './lib/store';
import Places from './routes/Places';
import Settings from './routes/Settings';
import TripDetail from './routes/TripDetail';
import TripList from './routes/TripList';

export default function App() {
  const route = useRoute();
  const ready = useStore((s) => s.ready);
  if (!ready) return <div className="center muted">読み込み中…</div>;
  if (route[0] === 'trip' && route[1]) return <TripDetail id={route[1]} tab={route[2] ?? 'plan'} />;
  if (route[0] === 'settings') return <Settings />;
  if (route[0] === 'places') return <Places />;
  return <TripList />;
}
