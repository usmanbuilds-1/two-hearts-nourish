import { ScanSheetV1 } from "./ScanSheetV1";

export type ScanSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManual: () => void;
};

// Restore the original scanner unconditionally. Leaving the V2 implementation
// in the repository allows a future deliberate relaunch after real-world QA;
// an older production VITE_SCANNER_V2_ENABLED=true must NOT opt users back in.
export function ScanSheet(props: ScanSheetProps) {
  return <ScanSheetV1 {...props} />;
}
