// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { h, preservingFocus, replaceChildren } from '../../src/ui/dom';

describe('h', () => {
  it('treats text as text, never as HTML', () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const element = h('p', { title: hostile }, hostile);
    expect(element.textContent).toBe(hostile);
    expect(element.querySelector('img')).toBeNull();
    expect(element.getAttribute('title')).toBe(hostile);
  });

  it('sets classes, attributes and listeners, skipping empty values', () => {
    const onclick = vi.fn();
    const button = h(
      'button',
      { class: 'a b', disabled: true, hidden: false, 'aria-label': 'Go', onclick },
      'x',
      null,
      false,
      0,
    );
    expect(button.className).toBe('a b');
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.hasAttribute('hidden')).toBe(false);
    expect(button.textContent).toBe('x0');
    const live = h('button', { onclick }, 'go');
    live.click();
    expect(onclick).toHaveBeenCalledOnce();
  });

  it('replaces children and keeps focus on the same control after a re-render', () => {
    const region = h('div');
    document.body.append(region);
    const render = () => replaceChildren(region, h('button', { 'data-focus-key': 'k' }, 'again'));
    render();
    region.querySelector('button')?.focus();
    preservingFocus(region, render);
    expect(document.activeElement?.textContent).toBe('again');
    expect(region.children).toHaveLength(1);
  });
});
