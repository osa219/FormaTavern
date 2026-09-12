import { describe, it, expect } from 'bun:test';
import { render } from 'svelte/server';
import DecorLayers from '../src/lib/components/custom/DecorLayers.svelte';

describe('DecorLayers Component (Slice 5 / Invariants C13 & D7)', () => {
  it('renders nothing when layers array is empty or undefined', () => {
    const renderedEmpty = render(DecorLayers, { props: { layers: [] } });
    expect(renderedEmpty.body.replace(/<!--[\s\S]*?-->/g, '').trim()).toBe('');

    const renderedUndefined = render(DecorLayers, { props: {} });
    expect(renderedUndefined.body.replace(/<!--[\s\S]*?-->/g, '').trim()).toBe('');
  });

  it('renders decor layers with aria-hidden="true" and pointer-events-none container', () => {
    const rendered = render(DecorLayers, {
      props: {
        layers: [
          { image: '/assets/characters/eldrin/gem.png', position: 'top-left', opacity: 0.8, blur: '2px' }
        ]
      }
    });

    const body = rendered.body;
    expect(body).toContain('aria-hidden="true"');
    expect(body).toContain('pointer-events-none');
    expect(body).toContain('fixed');
    expect(body).toContain('top-0 left-0');
    expect(body).toContain('/assets/characters/eldrin/gem.png');
    expect(body).toContain('opacity: 0.8');
    expect(body).toContain('blur(2px)');
  });

  it('enforces Invariant C13 budget cap: renders at most 2 layers even if 3 are provided', () => {
    const rendered = render(DecorLayers, {
      props: {
        layers: [
          { image: '/assets/layer1.png', position: 'top-left' },
          { image: '/assets/layer2.png', position: 'bottom-right' },
          { image: '/assets/layer3.png', position: 'center' }
        ]
      }
    });

    const body = rendered.body;
    expect(body).toContain('/assets/layer1.png');
    expect(body).toContain('/assets/layer2.png');
    // Third layer must be stripped by C13 budget slice
    expect(body).not.toContain('/assets/layer3.png');
  });

  it('maps all seven position presets to correct Tailwind position utility classes', () => {
    const positions = [
      { pos: 'top-left' as const, expected: 'top-0 left-0' },
      { pos: 'top-right' as const, expected: 'top-0 right-0' },
      { pos: 'bottom-left' as const, expected: 'bottom-0 left-0' },
      { pos: 'bottom-right' as const, expected: 'bottom-0 right-0' },
      { pos: 'center' as const, expected: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' },
      { pos: 'top-center' as const, expected: 'top-0 left-1/2 -translate-x-1/2' },
      { pos: 'bottom-center' as const, expected: 'bottom-0 left-1/2 -translate-x-1/2' }
    ];

    for (const { pos, expected } of positions) {
      const rendered = render(DecorLayers, {
        props: {
          layers: [{ image: '/assets/test.png', position: pos }]
        }
      });
      expect(rendered.body).toContain(expected);
    }
  });

  it('applies custom size and offset styles when configured', () => {
    const rendered = render(DecorLayers, {
      props: {
        layers: [
          {
            image: '/assets/custom.png',
            size: '220px',
            offset: { x: '15px', y: '-10px' }
          }
        ]
      }
    });

    const body = rendered.body;
    expect(body).toContain('width: 220px');
    expect(body).toContain('max-width: 220px');
    expect(body).toContain('translate: 15px -10px');
    expect(body).toContain('data-slot="1"');
  });

  it('renders data-slot="1" and data-slot="2" for multiple layers', () => {
    const rendered = render(DecorLayers, {
      props: {
        layers: [
          { image: '/assets/layer1.png' },
          { image: '/assets/layer2.png' }
        ]
      }
    });

    const body = rendered.body;
    expect(body).toContain('data-slot="1"');
    expect(body).toContain('data-slot="2"');
  });
});
