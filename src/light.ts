// The light masses move all the time; out of view there is nothing to see,
// so they stop there and pick up where they were when they come back.
// Hidden tabs are already paused by the browser.
export function setupLight(document: Document): void {
  const lights = document.querySelectorAll<HTMLElement>('.light');
  if (lights.length === 0 || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) entry.target.toggleAttribute('data-paused', !entry.isIntersecting);
    },
    { rootMargin: '120px' },
  );
  for (const light of lights) observer.observe(light);
}
