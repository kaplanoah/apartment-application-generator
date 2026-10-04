import type { CalendarDate } from '../core/calendar';
import type { Services } from './actions';
import { createDetailsStep } from './detailsStep';
import { h } from './dom';
import { createFolderStep } from './folderStep';
import { createGenerateStep } from './generateStep';
import { createOrderStep } from './orderStep';
import { initialState, type AppState } from './state';
import { Store } from './store';

export function mountApp(root: HTMLElement, today: CalendarDate, services: Services): Store<AppState> {
  const store = new Store(initialState(today));
  const steps = [
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
        h('strong', null, 'Local only.'),
        ' This page never connects to the internet. Your documents are read in this browser tab, and nothing is ever transferred or stored.',
      ),
    ),
    h('main', null, ...steps.map((step) => step.element)),
  );

  store.subscribe((state, previous) => steps.forEach((step) => step.update(state, previous)));
  return store;
}
