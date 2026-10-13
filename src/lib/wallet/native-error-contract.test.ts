import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { WALLET_ERROR_CODES, walletErrorCode } from './contracts';
import { TauriWalletAdapter } from './tauri';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

// Source tripwire for the current Rust error idioms, not a Rust parser or a
// substitute for native command tests. Scan every platform branch without
// maintaining a second list of native codes or relying on exercised failures.
function nativeErrorCodes(source: string): string[] {
  for (const call of source.matchAll(/\bapi_error\(\s*([^,\n]+)/g)) {
    // A new computed-code idiom needs explicit coverage instead of silently
    // escaping this declaration check. The third form is the function signature.
    expect(call[1]).toMatch(/^(?:"[a-z][a-z0-9_]+"|error\.code\(\)|code: &'static str)$/);
  }
  const codes = [...source.matchAll(/\bapi_error\(\s*"([a-z][a-z0-9_]+)"/g)].map(
    (match) => match[1]
  );
  for (const error of source.matchAll(/\bApiError\s*\{([^{}]*)\}/g)) {
    codes.push(...[...error[1].matchAll(/\bcode:\s*"([a-z][a-z0-9_]+)"/g)].map((m) => m[1]));
  }
  for (const method of source.matchAll(
    /\bpub fn code\([^)]*\)\s*->\s*&'static str\s*\{([\s\S]*?)\n    \}/g
  )) {
    codes.push(...[...method[1].matchAll(/"([a-z][a-z0-9_]+)"/g)].map((m) => m[1]));
  }
  return [...new Set(codes)];
}

describe('native error contract', () => {
  it('recognizes direct, multiline, struct, and domain error declarations', () => {
    expect(
      nativeErrorCodes(`
api_error("direct_failure", message);
api_error(
    "multiline_failure",
    message,
);
ApiError { code: "struct_failure", message, existing_wallet_id: None }
Warning { code: "not_an_error" }
impl ExampleError {
    pub fn code(self) -> &'static str {
        match self {
            Self::Invalid => "domain_failure",
        }
    }
}`)
    ).toEqual(['direct_failure', 'multiline_failure', 'struct_failure', 'domain_failure']);
  });

  it('keeps declared native API errors in the frontend allowlist', () => {
    const root = fileURLToPath(new URL('../../../src-tauri/src/', import.meta.url));
    const files = globSync('**/*.rs', { cwd: root }).filter(
      (file) => !/(?:^|\/)(?:tests|perf|[^/]*_tests)\.rs$/.test(file)
    );
    expect(files).toContain('wallet/explorer_commands.rs');
    expect(files).toContain('wallet/label_interchange.rs');
    const missing = files.flatMap((file) =>
      nativeErrorCodes(readFileSync(join(root, file), 'utf8'))
        .filter((code) => walletErrorCode(code) !== code)
        .map((code) => `${file}: ${code}`)
    );
    expect(missing).toEqual([]);
  });

  it('requires review of a new computed error-code idiom', () => {
    expect(() => nativeErrorCodes('api_error(dynamic_code, message)')).toThrow();
  });

  it.each(WALLET_ERROR_CODES)('preserves native %s through the real adapter', async (code) => {
    vi.mocked(invoke).mockRejectedValueOnce({ code, message: 'Safe native error' });
    await expect(new TauriWalletAdapter().exists()).rejects.toMatchObject({
      name: 'WalletError',
      code,
      message: 'Safe native error'
    });
  });

  it.each(['unrecognized_native_error', null, 123])(
    'fails closed for unknown code %s',
    async (code) => {
      vi.mocked(invoke).mockRejectedValueOnce({ code, message: 'Safe native error' });
      await expect(new TauriWalletAdapter().exists()).rejects.toMatchObject({
        code: 'internal_error'
      });
    }
  );
});
