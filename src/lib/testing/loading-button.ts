import { mount } from 'svelte';
import Button from '../components/Button.svelte';

// Dev-server-only fixture: exercise the actual component and its compiled scope.
export function mountLoadingButton(target: HTMLElement) {
  return mount(Button, {
    target,
    props: { disabled: true, loading: true, loadingLabel: 'Working…' }
  });
}
