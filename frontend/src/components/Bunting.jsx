// A row of patriotic American flag bunting (fan swags) that drapes from the
// bottom edge of the site header. Pure CSS; decorative only.
export default function Bunting() {
  const swags = Array.from({ length: 16 });
  return (
    <div className="bunting" aria-hidden="true">
      {swags.map((_, i) => (
        <span className="swag" key={i} />
      ))}
    </div>
  );
}
