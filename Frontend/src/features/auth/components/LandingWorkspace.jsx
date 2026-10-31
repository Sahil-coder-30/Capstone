import { useEffect, useRef, useState } from 'react';

const clip = (theme) => `/video/taksha-workspace-${theme}`;

// The real workspace, rendered from the app's own components in launch-video.
// Each theme has its own clip, and it only plays while on screen.
export default function LandingWorkspace({ isLight }) {
  const videoRef = useRef(null);
  const [reducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const source = clip(isLight ? 'light' : 'dark');

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion) return undefined;
    video.muted = true;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    }, { threshold: 0.2 });
    observer.observe(video);

    return () => observer.disconnect();
  }, [reducedMotion, source]);

  return (
    <div className="lp-workspace">
      <video
        key={source}
        ref={videoRef}
        src={`${source}.mp4`}
        poster={`${source}.jpg`}
        muted
        loop
        playsInline
        preload="metadata"
        controls={reducedMotion}
        aria-label="The Taksha workspace building an app from one prompt"
      />
    </div>
  );
}
