import { TransparentBody } from "./BodyParts";
import { Organs, Skeleton } from "./Organs";
import { HotspotMarker } from "./HotspotMarker";
import { HOTSPOTS } from "./hotspots";

interface SceneProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  systemFilter: string;
}

export function AnatomyScene({ activeId, onSelect, systemFilter }: SceneProps) {
  const filtered = Object.values(HOTSPOTS).filter(
    (h) => systemFilter === "all" || h.system === systemFilter
  );

  return (
    <group>
      <TransparentBody />
      <Organs />
      <Skeleton />
      {filtered.map((h) => (
        <HotspotMarker key={h.id} hotspot={h} active={activeId === h.id} onSelect={onSelect} />
      ))}
    </group>
  );
}