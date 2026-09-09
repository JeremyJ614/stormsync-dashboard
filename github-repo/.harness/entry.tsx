import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MoonAstronomy from "../src/pages/MoonAstronomy";
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}>
    <MoonAstronomy location={{ lat: 35.4676, lon: -97.5164, name: "Oklahoma City", region: "OK" } as never} />
  </QueryClientProvider>
);
