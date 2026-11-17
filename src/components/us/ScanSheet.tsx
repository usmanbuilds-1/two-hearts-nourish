import { ScanSheetV1 } from "./ScanSheetV1";
import { ScanSheetV2 } from "./ScanSheetV2";

export type ScanSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManual: () => void;
};

// V2 is the UI default. Setting VITE_SCANNER_V2_ENABLED=false still gives us an instant rollback path.
const V2_ENABLED = import.meta.env["VITE_SCANNER_V2_ENABLED"] !== "false";

export function ScanSheet(props: ScanSheetProps) {
  return V2_ENABLED ? <ScanSheetV2 {...props} /> : <ScanSheetV1 {...props} />;
}
