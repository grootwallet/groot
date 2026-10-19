const mobileSetupRoutes = new Set(['/mobile/pair', '/mobile/recover', '/mobile/watch']);

// These create/import a separate wallet; they never unlock the selected one.
export function isMobileSetupRoute(pathname: string): boolean {
  return mobileSetupRoutes.has(pathname);
}
