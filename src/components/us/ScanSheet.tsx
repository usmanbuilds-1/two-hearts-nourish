import { ScanSheetV1 } from "./ScanSheetV1";
import { ScanSheetV2 } from "./ScanSheetV2";

export type ScanSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManual: () => void;
};

const V2_ENABLED = import.meta.env["VITE_SCANNER_V2_ENABLED"] === "true";

export function ScanSheet(props: ScanSheetProps) {
  return V2_ENABLED ? <ScanSheetV2 {...props} /> : <ScanSheetV1 {...props} />;
}
