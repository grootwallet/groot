<script lang="ts">
  import inkUrl from '../../../assets/brand/lockup-horizontal-ink.svg?url';
  import reversedUrl from '../../../assets/brand/lockup-horizontal-reversed.svg?url';

  let {
    variant = 'auto',
    alt = 'Groot',
    animated = false
  }: {
    variant?: 'auto' | 'ink' | 'reversed';
    alt?: string;
    animated?: boolean;
  } = $props();
</script>

<span
  class="brand-lockup"
  class:auto={variant === 'auto'}
  class:animated
  role="img"
  aria-label={alt}
>
  {#if variant !== 'reversed'}<img class="ink" src={inkUrl} alt="" />{/if}
  {#if variant !== 'ink'}<img class="reversed" src={reversedUrl} alt="" />{/if}
</span>

<style>
  .brand-lockup {
    display: inline-flex;
    width: 100%;
    line-height: 0;
    overflow: hidden;
  }
  img {
    display: block;
    width: 100%;
    height: auto;
  }
  .auto .reversed {
    display: none;
  }
  :global(html[data-theme='dark']) .auto .ink {
    display: none;
  }
  :global(html[data-theme='dark']) .auto .reversed {
    display: block;
  }
  .animated img {
    animation: brand-lockup-reveal 900ms cubic-bezier(0.2, 0.72, 0.24, 1) both;
    will-change: clip-path, opacity;
  }
  @keyframes brand-lockup-reveal {
    from {
      clip-path: inset(0 100% 0 0);
      opacity: 0.72;
    }
    to {
      clip-path: inset(0 0 0 0);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .animated img {
      animation: none;
      clip-path: none;
      opacity: 1;
      will-change: auto;
    }
  }
</style>
