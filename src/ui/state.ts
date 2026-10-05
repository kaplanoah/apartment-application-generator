import type { CalendarDate } from '../core/calendar';
import type { ContactInfo } from '../core/contactInfo';
import type { Library } from '../core/library';
import type { PacketItem } from '../core/packet';
import { footerText } from '../core/naming';
import { DEFAULT_SIZE_PRESET, type SizePresetId } from '../core/sizePresets';

export type ContactState =
  | { readonly status: 'missing' }
  | { readonly status: 'unreadable'; readonly reason: string }
  | { readonly status: 'loaded'; readonly info: ContactInfo };

interface LoadedFolder {
  readonly name: string;
  readonly library: Library<File>;
  readonly contact: ContactState;
}

/** Where a packet's size comes from, shown after generating a large one. */
export interface SizeReport {
  /** Each section's original size and roughly what it takes up in the packet, largest first. */
  readonly sections: readonly { readonly title: string; readonly before: number; readonly after: number }[];
  /** Saved by storing repeated images and fonts once, and similar lossless clean-up. */
  readonly sharedSaved: number;
}

export interface Notice {
  readonly message: string;
  readonly details: readonly string[];
}

type BuildStatus =
  | { readonly status: 'idle' }
  /** `progress` runs from 0 to 1 across reading the files and building the PDF. */
  | { readonly status: 'working'; readonly progress: number; readonly label: string }
  | {
      readonly status: 'done';
      readonly fileName: string;
      readonly pageCount: number;
      readonly byteLength: number;
      readonly sizeReport: SizeReport;
    }
  | ({ readonly status: 'error' } & Notice);

export interface AppState {
  readonly today: CalendarDate;
  readonly address: string;
  readonly folder: LoadedFolder | null;
  readonly folderLoading: boolean;
  readonly folderError: Notice | null;
  readonly packet: readonly PacketItem[];
  readonly sizePreset: SizePresetId;
  readonly build: BuildStatus;
}

/** The footer printed on every page, from the applicants and the address. */
export function currentFooter(state: AppState): string {
  const contact = state.folder?.contact;
  const names = contact?.status === 'loaded' ? contact.info.applicants.map((person) => person.name) : [];
  return footerText(names, state.address, state.today);
}

export function initialState(today: CalendarDate): AppState {
  return {
    today,
    address: '',
    folder: null,
    folderLoading: false,
    folderError: null,
    packet: [],
    sizePreset: DEFAULT_SIZE_PRESET,
    build: { status: 'idle' },
  };
}
