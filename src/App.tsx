import { useEffect } from 'react';
import { DualPane } from './components/layout/DualPane';
import { MobileLayout } from './components/layout/MobileLayout';
import { useGKStore } from './store';
import { useResponsive } from './hooks/useResponsive';
import { checkEphemeralExpiry } from './core/vault';
import { seedDemoData } from './core/seed';

function App() {
  const { loadAll } = useGKStore();
  const { isMobile } = useResponsive();

  useEffect(() => {
    // Initialize DB, seed demo data if empty, then load everything
    seedDemoData()
      .then(() => loadAll())
      .catch(console.error);

    // Check for expired ephemeral vaults every 5 minutes
    checkEphemeralExpiry().catch(() => {});
    const interval = setInterval(() => checkEphemeralExpiry(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-ghost-bg">
      {isMobile ? <MobileLayout /> : <DualPane />}
    </div>
  );
}

export default App;
