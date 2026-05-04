import { useEffect } from 'react';
import { DualPane } from './components/layout/DualPane';
import { useGKStore } from './store';
import { checkEphemeralExpiry } from './core/vault';

function App() {
  const { loadAll, notify } = useGKStore();

  useEffect(() => {
    loadAll().catch(() => notify('Failed to load data', 'error'));
    checkEphemeralExpiry().catch(() => {});
    const interval = setInterval(() => checkEphemeralExpiry(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-ghost-bg">
      <DualPane />
    </div>
  );
}

export default App;
