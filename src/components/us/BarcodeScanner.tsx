import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { lookupPackagedBarcode } from "@/lib/food-catalog.functions";
import type { PackagedFood } from "@/lib/off-food";
import { Btn, TextInput } from "./primitives";

type Detector = {detect:(source:HTMLVideoElement)=>Promise<Array<{rawValue:string}>>};
type DetectorClass = new(options:{formats:string[]})=>Detector;

export function BarcodeScanner({onSelect}:{
  onSelect:(food:PackagedFood,amount:number)=>void
}) {
  const [code,setCode]=useState("");
  const [grams,setGrams]=useState("100");
  const [food,setFood]=useState<PackagedFood|null>(null);
  const [busy,setBusy]=useState(false);
  const [cameraOn,setCameraOn]=useState(false);
  const videoRef=useRef<HTMLVideoElement|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const intervalRef=useRef<number|null>(null);
  const busyFrame=useRef(false);

  function stopCamera(){
    if(intervalRef.current!==null)window.clearInterval(intervalRef.current);
    intervalRef.current=null;
    streamRef.current?.getTracks().forEach(track=>track.stop());
    streamRef.current=null;
    if(videoRef.current)videoRef.current.srcObject=null;
    setCameraOn(false);
  }
  useEffect(()=>()=>stopCamera(),[]);

  async function find(barcode:string){
    setBusy(true);
    setFood(null);
    try {
      const result=await lookupPackagedBarcode({data:{barcode}});
      if(!result.ok) {
        toast.error(result.error==="NOT_FOUND"
          ?"Not in Open Food Facts. You can add it manually."
          :result.error==="RATE_LIMIT"?"Too many lookups; try again shortly."
          :"Couldn't reach the food database.");
        return;
      }
      setFood(result.foods[0]??null);
    } catch {toast.error("Couldn't look up this barcode.");}
    finally{setBusy(false);}
  }

  async function startCamera(){
    const DetectorApi=(window as Window & {BarcodeDetector?:DetectorClass}).BarcodeDetector;
    if(!DetectorApi||!navigator.mediaDevices?.getUserMedia){
      toast.error("Camera barcode detection isn't supported here. Enter the barcode below.");
      return;
    }
    try {
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});
      streamRef.current=stream;
      setCameraOn(true);
      const video=videoRef.current;
      if(!video){stopCamera();return;}
      video.srcObject=stream;
      await video.play();
      const detector=new DetectorApi({formats:["ean_13","ean_8","upc_a","upc_e"]});
      intervalRef.current=window.setInterval(async()=>{
        if(busyFrame.current||video.readyState<2)return;
        busyFrame.current=true;
        try {
          const records=await detector.detect(video);
          const found=records.map(x=>x.rawValue).find(x=>/^\d{8,14}$/.test(x));
          if(found){
            setCode(found);
            stopCamera();
            void find(found);
          }
        }catch{ /* Ignore one bad video frame. */ }
        finally{busyFrame.current=false;}
      },450);
    }catch{
      stopCamera();
      toast.error("Camera unavailable. You can type the barcode.");
    }
  }

  const amount=Number(grams);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Scan a packaged product or enter its barcode. Data comes from Open Food Facts, not AI.
      </p>
      <Btn variant="outline" className="w-full" onClick={()=>cameraOn?stopCamera():void startCamera()}>
        {cameraOn?"Stop camera":"Try camera scanner"}
      </Btn>
      {cameraOn&&<video ref={videoRef} muted playsInline autoPlay className="max-h-48 w-full rounded-xl bg-black object-cover"/>}
      <form className="flex gap-2" onSubmit={e=>{
        e.preventDefault();
        if(/^\d{8,14}$/.test(code))void find(code);
        else toast.error("Enter an 8–14 digit barcode.");
      }}>
        <TextInput inputMode="numeric" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))}
          maxLength={14} placeholder="Barcode number" className="min-w-0 flex-1"/>
        <Btn disabled={busy||!/\d{8,14}/.test(code)}>{busy?"Finding…":"Find"}</Btn>
      </form>
      {food&&(
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="font-medium">{food.name}{food.brand?" · "+food.brand:""}</p>
          <p className="text-sm text-muted-foreground">Per 100g/ml: {food.calories} kcal · P {food.protein}g · C {food.carbs}g · F {food.fat}g</p>
          <label className="block text-sm">Amount in g/ml
            <TextInput type="number" inputMode="decimal" min={1} max={2000} value={grams} onChange={e=>setGrams(e.target.value)}/>
          </label>
          <Btn className="w-full" disabled={!Number.isFinite(amount)||amount<=0||amount>2000}
            onClick={()=>onSelect(food,amount)}>Use this food</Btn>
        </div>
      )}
    </div>
  );
}
