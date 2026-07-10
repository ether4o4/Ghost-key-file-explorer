import { useEffect, useState } from 'react';

/**
 * NeverSoft Services boot splash.
 *
 * A full-screen overlay shown once on launch, then it fades out after a
 * split second and hands off to the real UI. It never blocks interaction:
 * once dismissed it stops rendering entirely.
 */
export const NeverSoftSplash: React.FC = () => {
  const [visible, setVisible] = useState(true);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const fade = window.setTimeout(() => setVisible(false), 900);
    const remove = window.setTimeout(() => setGone(true), 1400);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(remove);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 500ms ease',
        background:
          'radial-gradient(1200px 600px at 15% -10%, rgba(108,99,255,0.18), transparent 60%),' +
          'radial-gradient(900px 500px at 110% 10%, rgba(0,212,255,0.12), transparent 55%),' +
          'linear-gradient(180deg, #0a0b0e 0%, #0c0d12 100%)',
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 700,
          fontSize: 38,
          color: '#e2e8f0',
          background: 'linear-gradient(135deg, #6c63ff 0%, #00d4ff 100%)',
          boxShadow: '0 0 24px rgba(108,99,255,0.45)',
        }}
      >
        N
      </div>

      <div
        style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 600,
          fontSize: 20,
          letterSpacing: '0.01em',
          color: '#e2e8f0',
        }}
      >
        NeverSoft Services
      </div>

      <div
        style={{
          width: 140,
          height: 3,
          borderRadius: 2,
          overflow: 'hidden',
          background: 'rgba(226,232,240,0.12)',
        }}
      >
        <div className="neversoft-splash-bar" />
      </div>
    </div>
  );
};
