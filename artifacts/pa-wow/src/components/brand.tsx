export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative grid h-8 w-8 place-items-center rounded-md bg-[#10205b] ring-1 ring-white/15">
        <div className="absolute bottom-1.5 left-1.5 h-2 w-1 rounded-[1px] bg-[#2bb0a3]" />
        <div className="absolute bottom-1.5 left-3 h-3.5 w-1 rounded-[1px] bg-[#8ea0ee]" />
        <div className="absolute bottom-1.5 left-[18px] h-5 w-1 rounded-[1px] bg-[#e0a800]" />
      </div>
      <div className="leading-tight">
        <div className="text-[13px] font-semibold tracking-tight">Private Assets</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-70">Week on Week</div>
      </div>
    </div>
  );
}
