/** Indian packaging convention: green dot in a square = vegetarian, red/brown dot = non-vegetarian. Shown only when data is reliable. */
export default function VegMark({ veg }: { veg: boolean | null | undefined }) {
  if (veg == null) return null;
  const c = veg ? "#1F7A5A" : "#B3261E";
  return (
    <span role="img" aria-label={veg ? "Vegetarian" : "Non-vegetarian"} title={veg ? "Vegetarian" : "Non-vegetarian"} className="inline-grid h-4 w-4 place-items-center rounded-[3px] border-2 bg-white" style={{ borderColor: c }}>
      <span className="h-2 w-2 rounded-full" style={{ background: c }} />
    </span>
  );
}
