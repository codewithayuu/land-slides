"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <html>
      <body style={{ padding: 16, fontFamily: "system-ui" }}>
        <h3>Something went wrong</h3>
        <p style={{ color: "#6b7280" }}>{error.message}</p>
        <button
          onClick={() => reset()}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#f8fafc",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </body>
    </html>
  );
}
