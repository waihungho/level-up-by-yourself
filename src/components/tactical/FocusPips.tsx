import { MAX_FOCUS } from "@/lib/tactical/constants";

export function FocusPips({ focus }: { focus: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`Focus ${focus} of ${MAX_FOCUS}`}>
      <span className="font-mono text-[9px] text-gray-500 mr-0.5">FOCUS</span>
      {Array.from({ length: MAX_FOCUS }, (_, i) => (
        <span key={i} className={`w-2 h-2 rounded-full ${i < focus ? "bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.7)]" : "bg-gray-700"}`} />
      ))}
    </div>
  );
}
