import dynamic from "next/dynamic";

const MapView = dynamic(() => import("./components/MapView"), {
  ssr: false,
  loading: () => <div style={{ padding: 16 }}>Loading map…</div>,
});

export default function Page() {
  return (
    <main>
      <MapView />
    </main>
  );
}
