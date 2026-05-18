import { useState, useEffect } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export interface ResponsiveState {
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchDevice: boolean;
  windowSize: { width: number; height: number };
  orientation: 'portrait' | 'landscape';
}

const BREAKPOINTS = {
  mobile: 640,
  tablet: 1024,
  desktop: 1280,
} as const;

function getBreakpoint(width: number): Breakpoint {
  if (width < BREAKPOINTS.mobile) return 'mobile';
  if (width < BREAKPOINTS.tablet) return 'tablet';
  return 'desktop';
}

export function useResponsive(): ResponsiveState {
  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  }));

  useEffect(() => {
    let raf: number;
    const handleResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setWindowSize({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      });
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  const breakpoint = getBreakpoint(windowSize.width);

  return {
    breakpoint,
    isMobile: breakpoint === 'mobile',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
    isTouchDevice: breakpoint === 'mobile' || breakpoint === 'tablet',
    windowSize,
    orientation: windowSize.width < windowSize.height ? 'portrait' : 'landscape',
  };
}
