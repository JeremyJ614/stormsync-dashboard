/**
 * NHC text products for a storm. The URLs come straight from CurrentStorms.json
 * per storm, so nothing here guesses a filename.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText } from "lucide-react";
import { type Storm, tropicalFetch, GOLD } from "../../lib/tropical";
import { Panel, Spinner, Empty, TabBar, Source } from "./ui";

type Key = "publicAdvisory" | "forecastAdvisory" | "discussion" | "windProbabilities";

const PRODUCTS: { key: Key; label: string; blurb: string }[] = [
  { key: "publicAdvisory",    label: "Public",     blurb: "The plain-language advisory: watches, warnings, hazards and the current position." },
  { key: "forecastAdvisory",  label: "Forecast",   blurb: "The technical forecast (TCM): centre positions, wind radii by quadrant and forecast intensity." },
  { key: "discussion",        label: "Discussion", blurb: "The forecaster's reasoning — model agreement, confidence and what could change." },
  { key: "windProbabilities", label: "Wind Probs", blurb: "Probability of tropical-storm, 50 kt and hurricane-force winds at each location." },
];

export default function AdvisoryPanel({ storm }: { storm: Storm }) {
  const available = PRODUCTS.filter((p) => storm.links[p.key]);
  const [tab, setTab] = useState<Key>(available[0]?.key ?? "publicAdvisory");
  const url = storm.links[tab];

  const { data, isLoading, isError, error } = useQuery<{ text: string; url: string }>({
    queryKey: ["advisory", url],
    queryFn: () => tropicalFetch(`/advisory?url=${encodeURIComponent(url!)}`),
    enabled: !!url,
    staleTime: 10 * 60_000,
  });

  if (!available.length) {
    return (
      <Panel title="Advisories" eyebrow="NHC text products">
        <Empty title="No advisories published yet" detail="Text products appear with the first advisory for a system." />
      </Panel>
    );
  }

  const active = PRODUCTS.find((p) => p.key === tab)!;

  return (
    <Panel
      flush
      eyebrow={storm.advisoryNum ? `Advisory #${storm.advisoryNum}` : "NHC text products"}
      title="Advisories"
      action={url && (
        <a href={url} target="_blank" rel="noopener noreferrer"
           className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider hover:underline"
           style={{ color: GOLD }}>
          <ExternalLink className="w-3 h-3" /> NHC
        </a>
      )}
    >
      <TabBar className="px-2" tabs={available.map((p) => ({ key: p.key, label: p.label }))} active={tab} onChange={setTab} />
      <p className="px-4 pt-3 text-[11px] text-muted-foreground/85 leading-relaxed">{active.blurb}</p>

      {isLoading && <Spinner />}
      {isError && <Empty title="Could not load this product" detail={(error as Error)?.message} />}
      {data?.text && (
        <pre
          className="mx-4 my-3 p-3.5 rounded-xl bg-background/60 border border-border/50 overflow-x-auto text-[11px] leading-[1.6] whitespace-pre-wrap"
          style={{ fontFamily: "var(--app-font-mono, Menlo, monospace)" }}
        >
          {data.text}
        </pre>
      )}
      {data && !data.text && (
        <Empty title="This product came back empty" detail={<>Read it directly at <a href={url!} target="_blank" rel="noopener noreferrer" className="underline">nhc.noaa.gov</a>.</>} />
      )}
      <div className="px-4 pb-4">
        <Source><FileText className="w-3 h-3 inline mr-1 -mt-0.5" /> Verbatim National Hurricane Center product. For life-safety decisions always defer to nhc.noaa.gov and your local NWS office.</Source>
      </div>
    </Panel>
  );
}
