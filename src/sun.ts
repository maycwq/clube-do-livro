// The sun of the desktop panel answers the mouse over the panel, as the
// hour would answer where you look: toward the sun the light flares, the
// halo and the core open up and the rays reach a little further; away from
// it, toward the text and the bottom, the light lowers into ember, a
// deeper amber-rose. The whole sun leans a few pixels toward the pointer,
// each layer by its own amount, and the rays turn a few degrees toward it.
//
// This only sets numbers on the sun (light.css turns them into transform
// and opacity, with long transitions, from the first time it answers).
// Nothing happens with touch, without a mouse, with reduced motion or while
// the sun isn't shown (narrow windows); leaving the panel lets everything
// settle back.

const REACH = 640; // px from the sun's center where the response fades out
const GLARE_RADIUS = 340; // within it, the light flares
const EMBER_FROM = 300; // past it, the light lowers into ember
const LEAN = 0.022; // px of lean per px of distance, before the layer's depth
const LEAN_MAX = 10;

export function setupSun(document: Document): void {
  const panel = document.querySelector<HTMLElement>('.opening');
  const sun = document.querySelector<HTMLElement>('.sun');
  const core = sun?.querySelector<HTMLElement>('.sun__core');
  if (!panel || !sun || !core) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let pointer: { x: number; y: number } | null = null;
  let frame = 0;

  panel.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || still.matches) return;
    pointer = { x: event.clientX, y: event.clientY };
    frame ||= requestAnimationFrame(answer);
  });
  panel.addEventListener('pointerleave', rest);
  // With reduced motion, back to rest at once.
  still.addEventListener('change', () => {
    sun.removeAttribute('data-answering');
    rest();
  });

  function answer() {
    frame = 0;
    // Hidden on narrow windows: nothing to answer with.
    if (!pointer || core!.offsetParent === null) return;
    const box = panel!.getBoundingClientRect();
    // The core's place in the panel, without its motion: the sun drifts a
    // few pixels, which doesn't matter here.
    const center = { x: box.left + core!.offsetLeft + core!.offsetWidth / 2, y: box.top + core!.offsetTop + core!.offsetHeight / 2 };
    const dx = pointer.x - center.x;
    const dy = pointer.y - center.y;
    const distance = Math.hypot(dx, dy);
    const glare = clamp(1 - distance / GLARE_RADIUS) ** 1.3;
    const ember = clamp((distance - EMBER_FROM) / (REACH - EMBER_FROM));
    // Angle around the sun as in the rays' gradient (0 up, clockwise): the
    // text lies around 205 (below, a little to the left), the free side of
    // the panel below 180, the headline toward 240.
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const aim = clamp(((angle < 0 ? angle + 360 : angle) - 205) * 0.3, -4, 4);
    const lean = Math.min(LEAN_MAX, distance * LEAN) / Math.max(distance, 1);

    sun!.setAttribute('data-answering', '');
    sun!.style.setProperty('--glare', glare.toFixed(3));
    sun!.style.setProperty('--ember', ember.toFixed(3));
    sun!.style.setProperty('--aim', `${aim.toFixed(2)}deg`);
    sun!.style.setProperty('--lean-x', `${(dx * lean).toFixed(2)}px`);
    sun!.style.setProperty('--lean-y', `${(dy * lean).toFixed(2)}px`);
  }

  function rest() {
    pointer = null;
    cancelAnimationFrame(frame);
    frame = 0;
    for (const name of ['--glare', '--ember', '--aim', '--lean-x', '--lean-y']) sun!.style.removeProperty(name);
  }
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}
