<script lang="ts">
  let { size = 21, title }: { size?: number; title?: string } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 128 128"
  fill="none"
  role={title ? 'img' : undefined}
  aria-hidden={title ? undefined : 'true'}
  focusable="false"
>
  {#if title}<title>{title}</title>{/if}
  <path
    d="M50 97H20V75A44 44 0 0 1 108 75V97H78"
    stroke="currentColor"
    stroke-width="20"
    stroke-linecap="butt"
    stroke-linejoin="miter"
    stroke-miterlimit="2"
  />
</svg>
