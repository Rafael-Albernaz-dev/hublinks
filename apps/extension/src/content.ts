// This marker is a UI hint. The worker still validates the sender and ticket exchange.
document.documentElement.setAttribute('data-hublink-extension', 'active');
window.dispatchEvent(new CustomEvent('hublink-extension-active', { detail: { version: '0.1.0' } }));
