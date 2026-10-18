// Native mobile uses a fixed app viewport; browser and desktop keep their zoom controls.
export function configureMobileViewport(mobile: boolean): (() => void) | undefined {
  if (!mobile) return;
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const previous = viewport?.content;
  viewport?.setAttribute(
    'content',
    'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
  );
  const preventGesture = (event: Event) => event.preventDefault();
  // WKWebView gesture events cover pinch without cancelling single-finger scrolling.
  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
  return () => {
    if (viewport && previous !== undefined) viewport.content = previous;
    document.removeEventListener('gesturestart', preventGesture);
    document.removeEventListener('gesturechange', preventGesture);
  };
}
