import dynamic from "next/dynamic";

const MapView = dynamic(() => import("./components/MapView"), { ssr: false });

export default function Page() {
  return (
    <main>
      <MapView />
    </main>
  );
}
