import type { CalendarDate } from '../core/calendar';
import type { Services } from './actions';
import { createDetailsStep } from './detailsStep';
import { h } from './dom';
import { icon } from './icons';
import { createFolderStep } from './folderStep';
import { createGenerateStep } from './generateStep';
import { createOrderStep } from './orderStep';
import { initialState, type AppState } from './state';
import { Store } from './store';

/** One section of the page; `update` re-renders it after the state changes. */
interface Step {
  readonly element: HTMLElement;
  readonly update?: (state: AppState, previous: AppState) => void;
}

export function mountApp(root: HTMLElement, today: CalendarDate, services: Services): Store<AppState> {
  const store = new Store(initialState(today));
  const steps: Step[] = [
    createDetailsStep(store),
    createFolderStep(store),
    createOrderStep(store),
    createGenerateStep(store, services),
  ];

  root.replaceChildren(
    h(
      'header',
      { class: 'masthead' },
      h('h1', null, 'Apartment Packet Builder'),
      h(
        'p',
        { class: 'local-only', role: 'note' },
        icon('lock'),
        h(
          'span',
          null,
          'Local only: this page never connects to the internet. Nothing is transferred or stored. ',
          h('a', { href: __SECURITY_PAGE_URL__, target: '_blank', rel: 'noopener noreferrer' }, 'Details'),
        ),
      ),
    ),
    h('main', null, ...steps.map((step) => step.element)),
  );

  store.subscribe((state, previous) => steps.forEach((step) => step.update?.(state, previous)));
  return store;
}
