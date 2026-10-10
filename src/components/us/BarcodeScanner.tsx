import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Btn, TextInput } from "@/components/us/primitives";

export function BarcodeScanner({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [barcode, setBarcode] = useState("");

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Scan Barcode</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-3">
          <TextInput
            placeholder="Enter barcode manually"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
          />
          <Btn className="w-full">Search by Barcode</Btn>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
