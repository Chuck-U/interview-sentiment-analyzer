import { useMemo } from "react";

const phaseOneChecklist = [
  "Electron main and preload entrypoints",
  "Vite + React renderer bootstrap",
  "TypeScript split for renderer and Electron runtime",
  "Tailwind CSS v4 foundation",
  "ESLint and Prettier baseline",
  "shadcn/ui initialization target",
];

export default function App() {
  const platformLabel = useMemo(() => window.electronApp.platform, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-16">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Phase 1 scaffold
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Interview Sentiment Analyzer desktop foundation
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            Electron, React, TypeScript, and the first renderer shell are wired
            together so the rest of the capture and coaching architecture can
            land on a stable base.
          </p>
        </div>

        <div className="grid gap-4 rounded-3xl border border-border/80 bg-card/60 p-6 shadow-sm backdrop-blur sm:grid-cols-[1.3fr_0.7fr]">
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-medium">What is ready</h2>
            <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
              {phaseOneChecklist.map((item) => (
                <li
                  key={item}
                  className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <aside className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-background/80 p-5">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">
                Runtime
              </span>
              <span className="text-lg font-semibold capitalize">
                {platformLabel}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">
                Next milestone
              </span>
              <span className="text-sm text-muted-foreground">
                Add shared DTOs, DDD backend skeletons, and session lifecycle
                boundaries in Phase 2.
              </span>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
