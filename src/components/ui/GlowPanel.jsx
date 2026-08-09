import './GlowPanel.css';

/** Rounded panel with the signature redstone glows + floating cubes. */
export default function GlowPanel({ className = '', children }) {
  return (
    <section className={`glow-panel ${className}`}>
      <div className="glow-panel-bg">
        <div className="gp-glow gp-glow-a" />
        <div className="gp-glow gp-glow-b" />
        <div className="gp-cube gp-cube-a" />
        <div className="gp-cube gp-cube-b" />
        <div className="gp-cube gp-cube-c" />
      </div>
      {children}
    </section>
  );
}
