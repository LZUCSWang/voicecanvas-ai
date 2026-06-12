import { appInfo } from './appInfo';

const baselineItems = [
  'React + TypeScript + Vite application shell',
  'Vitest baseline test',
  'Build, test, dev, and preview npm scripts',
];

export function App() {
  return (
    <main className="app-shell">
      <section className="workspace">
        <p className="eyebrow">PR 1 / Project scaffold</p>
        <h1>{appInfo.name}</h1>
        <p className="intro">
          当前版本只建立前端工程基线，尚未实现绘图、语音识别或后端能力。
        </p>

        <div className="status-panel" aria-label="当前工程状态">
          <div>
            <span className="label">Status</span>
            <strong>{appInfo.status}</strong>
          </div>
          <div>
            <span className="label">Stack</span>
            <strong>React + TypeScript + Vite</strong>
          </div>
        </div>

        <ul className="baseline-list" aria-label="已建立的工程基线">
          {baselineItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
