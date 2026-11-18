// Presentation bridge for the existing browser command-acceptance view.
// app.js renders these canonical attributes only from SequencePlayer targets,
// after the transport accepts a write. This bridge never opens a device,
// changes the draft, generates readback, or treats screen frames as acceptance.
const swatches = document.getElementById('live-swatches');
if (swatches) {
  let previous = '';
  const publish = () => {
    const targets = [...swatches.children].map(node => ({
      led: Number(node.dataset.led), color: node.dataset.color,
    })).filter(target => [0, 1, 2].includes(target.led) && /^#[0-9a-f]{6}$/i.test(target.color || ''));
    const identity = JSON.stringify(targets);
    if (identity === previous) return;
    previous = identity;
    for (const target of targets) {
      window.dispatchEvent(new CustomEvent('nb1-command-accepted', {detail: target}));
    }
  };
  new MutationObserver(publish).observe(swatches, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-led', 'data-color']});
  publish();
}
