export function Spinner({ fullScreen = false }: { fullScreen?: boolean }) {
  const ring = (
    <span
      role="status"
      aria-label="Memuatkan"
      className="block size-8 animate-spin rounded-full border-[3px] border-line border-t-accent"
    />
  );
  return fullScreen ? <div className="grid min-h-dvh place-items-center">{ring}</div> : ring;
}
