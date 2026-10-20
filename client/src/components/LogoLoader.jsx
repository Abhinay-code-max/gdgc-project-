export function LogoLoader({ message = 'Loading studio…' }) {
  return (
    <div className="logo-loader-container" role="status" aria-live="polite">
      <div className="logo-loader-graphic">
        <svg
          className="logo-loader-svg"
          viewBox="0 0 120 120"
          width="96"
          height="96"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Easel/frame outer diamond */}
          <rect
            className="loader-frame"
            x="20"
            y="20"
            width="80"
            height="80"
            rx="4"
            stroke="var(--rust, #a84d31)"
            strokeWidth="2.5"
          />
          {/* Inner canvas outline */}
          <rect
            className="loader-inner-canvas"
            x="28"
            y="28"
            width="64"
            height="64"
            rx="2"
            stroke="#d5cabc"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          {/* Elegant serif letter 'A' */}
          <text
            className="loader-letter"
            x="60"
            y="74"
            textAnchor="middle"
            fontFamily="'Playfair Display', serif"
            fontSize="46"
            fontStyle="italic"
            fontWeight="600"
            fill="var(--rust, #a84d31)"
          >
            A
          </text>
          {/* Animated artist palette brush stroke */}
          <path
            className="loader-stroke"
            d="M 32 90 Q 60 78 88 90"
            stroke="var(--green, #4e604b)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="logo-loader-wordmark">
        <span className="logo-loader-brand">Atelier</span>
        <small className="logo-loader-tag">ART STUDIO</small>
      </div>
      <p className="logo-loader-text">{message}</p>
    </div>
  );
}
