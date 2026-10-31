// The editorial panel sticks next to the form only when it fits whole in the
// window. On windows too short for it (layout.css gives it a floor), it
// scrolls with the page instead, so its top and its bottom stay reachable.
export function setupPanel(document: Document): void {
  const panel = document.querySelector<HTMLElement>('.opening');
  const view = panel?.parentElement;
  if (!panel || !view) return;
  const wide = matchMedia('(min-width: 1240px)');

  const update = () => {
    const edge = parseFloat(getComputedStyle(view).paddingTop);
    const fits = panel.getBoundingClientRect().height + edge <= innerHeight + 0.5;
    panel.toggleAttribute('data-sticky', wide.matches && fits);
  };

  new ResizeObserver(update).observe(panel);
  addEventListener('resize', update);
  update();
}
