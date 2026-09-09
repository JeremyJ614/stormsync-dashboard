import { useRef } from "react";
import { createRoot } from "react-dom/client";
import { BaseMap, type BaseMapHandle } from "../src/components/map/BaseMap";

function App() {
  const ref = useRef<BaseMapHandle>(null);
  (window as never as Record<string, unknown>).__map = () => ref.current?.map();
  return <BaseMap ref={ref} center={{ lat: 35.4676, lon: -97.5164 }} zoom={6} height={700} />;
}
createRoot(document.getElementById("root")!).render(<App />);
