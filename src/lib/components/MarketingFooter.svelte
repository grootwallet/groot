<footer class="marketing-footer">
  <div>
    <span>Test-network release. Mainnet is not enabled.</span>
    <nav aria-label="Footer navigation">
      <a href="/marketing/security">Security</a>
      <a href="/marketing/status">Status</a>
      <a href="/marketing/docs">Documentation</a>
    </nav>
  </div>
</footer>

<style>
  .marketing-footer { width: min(calc(100% - 48px), 1160px); margin: 100px auto 0; padding: 22px 0 38px; color: rgba(16, 42, 76, 0.7); border-top: 1px solid rgba(16, 42, 76, 0.2); font-family: 'Source Sans 3', ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; line-height: 1.5; }
  .marketing-footer > div { display: flex; justify-content: space-between; gap: 24px; }
  nav { display: flex; flex-wrap: wrap; gap: 18px; }
  a { color: inherit; text-underline-offset: 3px; }
  a:focus-visible { outline: 2px solid currentColor; outline-offset: 4px; }
  @media (max-width: 760px) {
    .marketing-footer { width: min(calc(100% - 32px), 1160px); margin-top: 72px; }
    .marketing-footer > div { flex-direction: column; }
  }
</style>
