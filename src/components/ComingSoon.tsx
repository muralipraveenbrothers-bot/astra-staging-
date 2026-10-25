/**
 * "Coming soon" marker for buttons whose feature is not built yet
 * (Round 4 prompt 10). Such buttons are rendered visibly disabled with this
 * label and a tooltip instead of showing a fake success toast.
 */
export const COMING_SOON_TITLE = "Coming soon - this feature is not built yet";

export function ComingSoonTag() {
  return (
    <span className="ml-1 inline-block rounded px-1 py-px align-middle text-[8px] font-bold uppercase tracking-wide bg-slate-700/80 text-slate-200">
      Coming soon
    </span>
  );
}