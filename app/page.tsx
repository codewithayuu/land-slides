"use client";

import { useEffect, useState, type ComponentType } from "react";

export default function Page() {
  const [Comp, setComp] = useState<ComponentType<unknown> | null>(null);
  const [err, setErr] = useState<Error | null>(null);

  useEffect(() => {
    let alive = true;
    import("./components/MapView")
      .then((m) => {
        if (alive) setComp(() => m.default as ComponentType<unknown>);
      })
      .catch((e) => {
        console.error("MapView load error", e);
        if (alive) setErr(e as Error);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (err) {
    return (
      <main>
        <div style={{ padding: 16 }}>Map failed to load: {String(err.message || err)}</div>
      </main>
    );
  }

  if (!Comp) {
    return (
      <main>
        <div style={{ padding: 16 }}>Loading map…</div>
      </main>
    );
  }

  const M = Comp;
  return (
    <main>
      <M />
    </main>
  );
}
