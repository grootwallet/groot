<script lang="ts">
  import inkUrl from '../../../assets/brand/lockup-horizontal-ink.svg?url';
  import reversedUrl from '../../../assets/brand/lockup-horizontal-reversed.svg?url';

  let { variant = 'auto', alt = 'Groot' }: { variant?: 'auto' | 'ink' | 'reversed'; alt?: string } =
    $props();
</script>

<span class="brand-lockup" class:auto={variant === 'auto'} role="img" aria-label={alt}>
  {#if variant !== 'reversed'}<img class="ink" src={inkUrl} alt="" />{/if}
  {#if variant !== 'ink'}<img class="reversed" src={reversedUrl} alt="" />{/if}
</span>

<style>
  .brand-lockup {
    display: inline-flex;
    width: 100%;
    line-height: 0;
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
</style>
