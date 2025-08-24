import { useEffect, useState } from 'react';

function ShinyText({ text, disabled = false, speed = 3, className = '', once = false, lifetimeMs = 2000 }) {
  const [active, setActive] = useState(!disabled);
  useEffect(() => {
    setActive(!disabled);
    if (once && !disabled) {
      const t = setTimeout(() => setActive(false), lifetimeMs);
      return () => clearTimeout(t);
    }
  }, [disabled, once, lifetimeMs, text]);

  const animationDuration = `${speed}s`;
  const gradient =
    'linear-gradient(120deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 45%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0) 55%, rgba(255,255,255,0) 100%)';
  return (
    <span className={`relative inline-block ${className}`}>
      <span className="text-gray-800">{text}</span>
      {active && (
        <span
          aria-hidden
          className="absolute inset-0 text-transparent bg-clip-text pointer-events-none select-none animate-shine"
          style={{
            backgroundImage: gradient,
            backgroundSize: '200% 100%',
            WebkitBackgroundClip: 'text',
            animationDuration,
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

export default ShinyText;


