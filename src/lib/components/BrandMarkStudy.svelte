<script lang="ts">
  let {
    size = 128,
    variant = 'control',
    guides = false,
    title
  }: {
    size?: number;
    variant?: 'raised' | 'control' | 'grove-g';
    guides?: boolean;
    title?: string;
  } = $props();
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

  {#if variant === 'control'}
    <path
      d="M64 21A54 54 0 0 0 10 75V105Q10 107 12 107H48Q50 107 50 105V91Q50 89 48 89H30Q28 89 28 87V75A36 36 0 0 1 100 75V87Q100 89 98 89H80Q78 89 78 91V105Q78 107 80 107H116Q118 107 118 105V75A54 54 0 0 0 64 21Z"
    />
  {:else if variant === 'raised'}
    <path
      d="M64 21A54 54 0 0 0 10 75V105Q10 107 12 107H48Q50 107 50 105V91Q50 89 48 89H30Q28 89 28 87V75A36 36 0 0 1 100 75V87Q100 89 98 89H80Q78 89 78 91V105Q78 107 80 107H116Q118 107 118 105V75A54 54 0 0 0 64 21Z"
    />
    <path d="M42 69Q42 67 44 67H58Q60 67 60 69V105Q60 107 58 107H44Q42 107 42 105Z" />
    <path d="M68 69Q68 67 70 67H84Q86 67 86 69V105Q86 107 84 107H70Q68 107 68 105Z" />
  {:else}
    <path
      d="M64 21A54 54 0 0 0 10 75V105Q10 107 12 107H26Q28 107 28 105V75A36 36 0 0 1 100 75V105Q100 107 102 107H116Q118 107 118 105V75A54 54 0 0 0 64 21Z"
    />
    <path d="M26 89H53Q55 89 55 87V69Q55 67 57 67H71Q73 67 73 69V105Q73 107 71 107H26Z" />
  {/if}

  {#if guides}
    <g
      fill="none"
      stroke="var(--guide-color, #d3293a)"
      stroke-width="0.75"
      vector-effect="non-scaling-stroke"
    >
      <circle cx="64" cy="75" r="54" opacity="0.5" stroke-dasharray="2 2" />
      <circle cx="64" cy="75" r="36" opacity="0.5" stroke-dasharray="2 2" />
      <path d="M64 7V121M4 75H124" opacity="0.72" stroke-dasharray="3 2" />
      <path
        d="M10 14V114M28 14V114M100 14V114M118 14V114M4 21H124M4 39H124M4 107H124"
        opacity="0.3"
        stroke-dasharray="1.5 2.5"
      />
      {#if variant === 'control'}
        <path d="M50 56V114M78 56V114M4 89H124" opacity="0.66" stroke-dasharray="2 2" />
      {:else if variant === 'raised'}
        <path
          d="M42 54V114M60 54V114M68 54V114M86 54V114M4 67H124"
          opacity="0.66"
          stroke-dasharray="2 2"
        />
      {:else}
        <path d="M55 54V114M73 54V114M4 67H124M4 89H124" opacity="0.66" stroke-dasharray="2 2" />
      {/if}
    </g>
  {/if}
</svg>
