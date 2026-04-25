import rocketLogo from '/assets/rocket-logo.png';

export default function Logo({ inverted = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img
        src={rocketLogo}
        alt="Consult Delivery"
        style={{
          width: 28,
          height: 'auto',
          display: 'block',
          filter: inverted ? 'none' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{
          fontFamily: 'Oswald, Impact, sans-serif',
          fontWeight: 700,
          fontSize: 15,
          color: inverted ? '#0D0D0D' : '#FFFFFF',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
        }}>Consult</span>
        <span style={{
          fontFamily: 'Oswald, Impact, sans-serif',
          fontWeight: 700,
          fontSize: 15,
          color: 'var(--red)',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
        }}>Delivery</span>
      </div>
    </div>
  );
}
