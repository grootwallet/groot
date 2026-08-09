<script lang="ts">
  let { size = 21, title }: { size?: number; title?: string } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 128 128"
  fill="currentColor"
  role={title ? 'img' : undefined}
  aria-hidden={title ? undefined : 'true'}
  focusable="false"
>
  {#if title}<title>{title}</title>{/if}
  <path
    d="M64 21A54 54 0 0 0 10 75V105Q10 107 12 107H48Q50 107 50 105V91Q50 89 48 89H30Q28 89 28 87V75A36 36 0 0 1 100 75V87Q100 89 98 89H80Q78 89 78 91V105Q78 107 80 107H116Q118 107 118 105V75A54 54 0 0 0 64 21Z"
  />
</svg>
