import { AdminPage } from '../admin/AdminPage.tsx';
import { StatsPage } from '../history/StatsPage.tsx';
import { PlayPage } from '../play/PlayPage.tsx';
import { TrackPage } from '../track/TrackPage.tsx';
import { Home } from './Home.tsx';
import { Sandbox } from './Sandbox.tsx';

/** Pathname routing; every navigation is a full page load (vercel.json rewrites to index.html). */
export function App() {
  switch (window.location.pathname) {
    case '/track':
      return <TrackPage />;
    case '/play':
      return <PlayPage />;
    case '/admin':
      return <AdminPage />;
    case '/stats':
      return <StatsPage />;
    case '/sandbox':
      return <Sandbox />;
    default:
      return <Home />;
  }
}
