import { Cpu, MonitorCog, Coffee, TerminalSquare, FolderSearch } from 'lucide-react';
import Toggle from '../../components/ui/Toggle.jsx';
import './InstanceOverrides.css';

const RES_PRESETS = [
  { label: '854×480', width: 854, height: 480 },
  { label: '1280×720', width: 1280, height: 720 },
  { label: '1600×900', width: 1600, height: 900 },
  { label: '1920×1080', width: 1920, height: 1080 }
];

export function normalizeOverrides(overrides, globals) {
  const g = globals || {};
  return {
    memory: {
      enabled: overrides?.memory?.enabled ?? false,
      min: overrides?.memory?.min ?? g.memory?.min ?? 1,
      max: overrides?.memory?.max ?? g.memory?.max ?? 4
    },
    resolution: {
      enabled: overrides?.resolution?.enabled ?? false,
      width: overrides?.resolution?.width ?? g.resolution?.width ?? 854,
      height: overrides?.resolution?.height ?? g.resolution?.height ?? 480,
      fullscreen: overrides?.resolution?.fullscreen ?? g.resolution?.fullscreen ?? false
    },
    java: {
      enabled: overrides?.java?.enabled ?? false,
      path: overrides?.java?.path ?? ''
    },
    jvmArgs: overrides?.jvmArgs ?? ''
  };
}

export default function InstanceOverridesForm({ value, globals, onChange = () => {} }) {
  const ov = normalizeOverrides(value, globals);
  const patch = (section, changes) =>
    onChange({ ...ov, [section]: { ...ov[section], ...changes } });

  const browseJava = async () => {
    const path = await window.native?.java?.browse();
    if (path) patch('java', { path });
  };

  const setMemory = (key, raw) => {
    let min = ov.memory.min;
    let max = ov.memory.max;
    if (key === 'min') { min = raw; if (min > max) max = min; }
    else { max = raw; if (max < min) min = max; }
    patch('memory', { min, max });
  };

  return (
    <div className="ov-form" data-testid="instance-overrides-form">
      {/* ── Memory ── */}
      <section className={`ov-card${ov.memory.enabled ? ' is-on' : ''}`}>
        <header className="ov-card-head">
          <span className="ov-card-title"><Cpu size={15} /> Memory (RAM)</span>
          <Toggle
            checked={ov.memory.enabled}
            onChange={(v) => patch('memory', { enabled: v })}
          />
        </header>
        {ov.memory.enabled ? (
          <div className="ov-card-body">
            <div className="ov-slider-row">
              <label>Maximum</label>
              <input
                type="range" min={1} max={32} step={1}
                value={ov.memory.max}
                data-testid="ov-memory-max"
                onChange={(e) => setMemory('max', Number(e.target.value))}
              />
              <strong>{ov.memory.max} GB</strong>
            </div>
            <div className="ov-slider-row">
              <label>Minimum</label>
              <input
                type="range" min={1} max={32} step={1}
                value={ov.memory.min}
                data-testid="ov-memory-min"
                onChange={(e) => setMemory('min', Number(e.target.value))}
              />
              <strong>{ov.memory.min} GB</strong>
            </div>
          </div>
        ) : (
          <p className="ov-fallback">
            Using global default — {globals?.memory?.min ?? 1}–{globals?.memory?.max ?? 4} GB
          </p>
        )}
      </section>

      {/* ── Resolution ── */}
      <section className={`ov-card${ov.resolution.enabled ? ' is-on' : ''}`}>
        <header className="ov-card-head">
          <span className="ov-card-title"><MonitorCog size={15} /> Window Resolution</span>
          <Toggle
            checked={ov.resolution.enabled}
            onChange={(v) => patch('resolution', { enabled: v })}
          />
        </header>
        {ov.resolution.enabled ? (
          <div className="ov-card-body">
            <div className="ov-res-inputs">
              <label className="ov-mini-field">
                <span>Width</span>
                <input
                  type="number" min={640} value={ov.resolution.width}
                  data-testid="ov-res-width"
                  onChange={(e) => patch('resolution', { width: Number(e.target.value) })}
                />
              </label>
              <span className="ov-res-x">×</span>
              <label className="ov-mini-field">
                <span>Height</span>
                <input
                  type="number" min={480} value={ov.resolution.height}
                  data-testid="ov-res-height"
                  onChange={(e) => patch('resolution', { height: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="ov-preset-row">
              {RES_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`ov-preset${ov.resolution.width === p.width && ov.resolution.height === p.height ? ' active' : ''}`}
                  onClick={() => patch('resolution', { width: p.width, height: p.height })}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label className="ov-inline-toggle">
              <span>Launch fullscreen</span>
              <Toggle
                checked={ov.resolution.fullscreen}
                onChange={(v) => patch('resolution', { fullscreen: v })}
              />
            </label>
          </div>
        ) : (
          <p className="ov-fallback">
            Using global default — {globals?.resolution?.width ?? 854}×{globals?.resolution?.height ?? 480}
          </p>
        )}
      </section>

      {/* ── Java ── */}
      <section className={`ov-card${ov.java.enabled ? ' is-on' : ''}`}>
        <header className="ov-card-head">
          <span className="ov-card-title"><Coffee size={15} /> Java Runtime</span>
          <Toggle
            checked={ov.java.enabled}
            onChange={(v) => patch('java', { enabled: v })}
          />
        </header>
        {ov.java.enabled ? (
          <div className="ov-card-body">
            <div className="ov-java-row">
              <input
                type="text"
                className="ov-java-input"
                placeholder="Path to java executable…"
                value={ov.java.path}
                data-testid="ov-java-path"
                onChange={(e) => patch('java', { path: e.target.value })}
              />
              <button type="button" className="ov-browse-btn" onClick={browseJava} data-testid="ov-java-browse">
                <FolderSearch size={15} /> Browse
              </button>
            </div>
          </div>
        ) : (
          <p className="ov-fallback">Using the auto-detected Java for this version.</p>
        )}
      </section>

      {/* ── JVM args ── */}
      <section className="ov-card">
        <header className="ov-card-head">
          <span className="ov-card-title"><TerminalSquare size={15} /> Extra JVM Arguments</span>
        </header>
        <div className="ov-card-body">
          <input
            type="text"
            className="ov-java-input"
            placeholder="-XX:+UseG1GC -Dsome.flag=true"
            value={ov.jvmArgs}
            data-testid="ov-jvm-args"
            onChange={(e) => onChange({ ...ov, jvmArgs: e.target.value })}
          />
          <p className="ov-fallback">Applied on top of the defaults whenever set.</p>
        </div>
      </section>
    </div>
  );
}
