import React from 'react';

interface Props {
  title: string;
  subtitle?: string;
  body?: string;
}

// Everything is sized in cqmin (1% of the smaller side of the slide), so the same slide
// fits the TV panel, the admin preview and any screen without overflowing.
const GREEN = '#1c7a3a';

/** Old announcements may still contain heading/bold markers; show them as plain text */
const cleanLine = (line: string) => line.replace(/^#\s+/, '').replace(/\*/g, '').trim();

/**
 * Every line uses the same big green style. Pick the largest size (in cqmin) at which the whole
 * message still fits in the box, estimating how many rows each line wraps onto. The box is about
 * 120 wide and 38 tall in these units on the TV panel.
 */
const messageSize = (lines: string[]): number => {
  const BOX_WIDTH = 118;
  const BOX_HEIGHT = 38;
  for (let size = 6; size > 2.6; size -= 0.2) {
    const charWidth = size * 0.6; // bold capitals are wide
    const rows = lines.reduce((total, l) => total + Math.max(1, Math.ceil((l.length * charWidth) / BOX_WIDTH)), 0);
    if (rows * size * 1.2 + (lines.length - 1) * 1 <= BOX_HEIGHT) return size;
  }
  return 2.6;
};

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: '4.6cqmin', height: '4.6cqmin' }} aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#1877f2" />
    <path fill="#fff" d="M13.4 19v-6.2h2.1l.4-2.5h-2.5V8.7c0-.7.3-1.3 1.4-1.3H16V5.2c-.2 0-1-.1-1.9-.1-2 0-3.3 1.2-3.3 3.4v1.8H8.6v2.5h2.2V19z" />
  </svg>
);

const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: '4.6cqmin', height: '4.6cqmin' }} fill="none" stroke="#fff" strokeWidth="1.6" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" />
    <path d="M2.5 12h19M12 2.5c2.6 2.6 4 6 4 9.5s-1.4 6.9-4 9.5c-2.6-2.6-4-6-4-9.5s1.4-6.9 4-9.5z" />
  </svg>
);

/** The PANELCO III announcement poster: logo header, orange title banner, bordered text box, footer. */
export const AnnouncementSlide: React.FC<Props> = ({ title, subtitle, body }) => {
  const lines = (body || '').split('\n').map(cleanLine).filter(Boolean);
  const size = messageSize(lines);

  return (
    <div
      className="w-full h-full overflow-hidden"
      style={{
        containerType: 'size',
        background: 'linear-gradient(180deg, #ffffff 0%, #fff7ea 50%, #e6f4ea 100%)',
        fontFamily: 'inherit',
      }}
    >
      <div className="w-full h-full flex flex-col items-center" style={{ padding: '2.4cqmin 4cqmin', gap: '2.4cqmin' }}>
        {/* Header: logo + cooperative name */}
        <div className="flex items-center shrink-0" style={{ gap: '2.2cqmin' }}>
          <img
            src="/logo.png"
            alt=""
            className="rounded-full object-contain bg-white shrink-0"
            style={{ width: '12cqmin', height: '12cqmin' }}
          />
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: '7cqmin', fontWeight: 900, color: GREEN, letterSpacing: '0.02em' }}>PANELCO III</div>
            <div style={{ fontSize: '2.3cqmin', fontWeight: 700, color: '#222' }}>PANGASINAN III ELECTRIC COOPERATIVE</div>
            <div style={{ fontSize: '2.4cqmin', fontStyle: 'italic', color: GREEN }}>Nancayasan, Urdaneta City, Pangasinan</div>
            <div style={{ fontSize: '1.7cqmin', fontWeight: 600, color: '#444' }}>CDA Reg. No. 9520-01008918</div>
          </div>
        </div>

        {/* Orange title banner */}
        <div
          className="w-full text-center shrink-0"
          style={{
            background: '#f2a03c',
            boxShadow: '1cqmin 1cqmin 0 #8fcfa8',
            padding: '1.6cqmin 2cqmin',
            color: '#111',
            lineHeight: 1.1,
          }}
        >
          <div style={{ fontSize: '6.4cqmin', fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</div>
          {subtitle && <div style={{ fontSize: '4.2cqmin', fontWeight: 800, marginTop: '0.6cqmin' }}>{subtitle}</div>}
        </div>

        {/* Bordered text box */}
        <div
          className="w-full flex-1 min-h-0 flex flex-col items-center justify-center text-center overflow-hidden"
          style={{
            border: `0.35cqmin solid ${GREEN}`,
            background: '#f2f2f0',
            boxShadow: '0.8cqmin 0.8cqmin 0 #f0c98a',
            padding: '2cqmin 3cqmin',
            gap: '1cqmin',
            color: '#1a1a1a',
          }}
        >
          {lines.map((line, i) => (
            <div key={i} style={{ fontSize: `${size}cqmin`, fontWeight: 900, color: GREEN, lineHeight: 1.15 }}>
              {line}
            </div>
          ))}
        </div>

        {/* Footer pills */}
        <div className="flex items-center justify-center shrink-0" style={{ gap: '3cqmin' }}>
          <div
            className="flex items-center rounded-full text-white"
            style={{ background: GREEN, padding: '0.8cqmin 2.4cqmin 0.8cqmin 1cqmin', gap: '1.2cqmin', fontSize: '3cqmin', fontWeight: 800 }}
          >
            <FacebookIcon />
            PANELCO III Official
          </div>
          <div
            className="flex items-center rounded-full text-white"
            style={{ background: GREEN, padding: '0.8cqmin 2.4cqmin 0.8cqmin 1cqmin', gap: '1.2cqmin', fontSize: '3cqmin', fontWeight: 800 }}
          >
            <GlobeIcon />
            <span style={{ textDecoration: 'underline' }}>www.panelco3.com.ph</span>
          </div>
        </div>
      </div>
    </div>
  );
};
