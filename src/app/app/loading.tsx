export default function Loading() {
  return (
    <div aria-busy="true" aria-label="A carregar">
      <div className="skeleton mb-3 h-4 w-32 rounded-full" />
      <div className="skeleton mb-10 h-12 w-72 rounded-2xl" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton aspect-square rounded-[1.15rem]" />
            <div className="skeleton mt-3 h-4 w-3/4 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
