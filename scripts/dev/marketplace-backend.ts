/** This proxy exists only in the explicitly started local sandbox, never packaged builds. */
export function marketplaceBackendEnabled(options: {
  command: 'build' | 'serve';
  isPreview?: boolean;
  nativePlatform?: string;
  flag?: string;
}): boolean {
  return (
    options.command === 'serve' &&
    !options.isPreview &&
    !options.nativePlatform &&
    options.flag === '1'
  );
}

/** A separately packaged test site; ordinary wallet builds can never opt in. */
export function marketplaceSandboxBuildEnabled(options: {
  command: 'build' | 'serve';
  mode?: string;
  nativePlatform?: string;
  flag?: string;
}): boolean {
  return (
    options.command === 'build' &&
    options.mode === 'marketplace-sandbox' &&
    !options.nativePlatform &&
    options.flag === '1'
  );
}

export function marketplaceBackendPort(value = '5200'): number {
  if (!/^[1-9][0-9]{3,4}$/.test(value) || Number(value) < 1024 || Number(value) > 65535)
    throw new Error('The local marketplace backend requires a valid loopback port.');
  return Number(value);
}
