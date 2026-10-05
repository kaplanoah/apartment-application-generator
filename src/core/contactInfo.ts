/**
 * Applicant contact details come from a plain-text file in the documents
 * folder, so they're easy to edit in TextEdit and never need to be stored by
 * the browser. Format: one "Label: value" per line, a blank line between
 * people, and every person starts with a Name line.
 */
export const CONTACT_FILE_NAME = 'contact-info.txt';

export const CONTACT_FILE_EXAMPLE = `Name: Alex Sample
Email: alex@example.com
Phone: (555) 010-2481

Name: Jordan Sample
Email: jordan@example.com
Phone: (555) 010-7730`;

export interface ContactDetail {
  readonly label: string;
  readonly value: string;
}

export interface Applicant {
  readonly name: string;
  /** Everything after the Name line, in file order. */
  readonly details: readonly ContactDetail[];
}

export interface ContactInfo {
  readonly applicants: readonly Applicant[];
  /** Lines that couldn't be understood, written for the person to fix. */
  readonly problems: readonly string[];
}

const MAX_APPLICANTS = 8;
const MAX_VALUE_LENGTH = 200;

/** Labels printed as just their value on the cover (no "Email:" prefix). */
const VALUE_ONLY_LABELS = new Set(['email', 'e-mail', 'phone', 'mobile', 'cell', 'tel', 'telephone']);

export function parseContactInfo(text: string): ContactInfo {
  const applicants: { name: string; details: ContactDetail[] }[] = [];
  const problems: string[] = [];
  let current: { name: string; details: ContactDetail[] } | null = null;

  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    const lineNumber = index + 1;
    if (line === '') {
      current = null;
      continue;
    }
    if (line.startsWith('#')) continue;

    const colon = line.indexOf(':');
    if (colon <= 0) {
      problems.push(`Line ${lineNumber}: "${clip(line)}" needs a label, like "Phone: (555) 010-2481".`);
      continue;
    }
    const label = line.slice(0, colon).trim();
    const value = line
      .slice(colon + 1)
      .trim()
      .slice(0, MAX_VALUE_LENGTH);

    if (label.toLowerCase() === 'name') {
      current = null;
      if (value === '') {
        problems.push(`Line ${lineNumber}: the Name is empty.`);
      } else if (applicants.length >= MAX_APPLICANTS) {
        problems.push(`Line ${lineNumber}: only the first ${MAX_APPLICANTS} people are used.`);
      } else {
        current = { name: value, details: [] };
        applicants.push(current);
      }
      continue;
    }
    if (!current) {
      problems.push(
        `Line ${lineNumber}: "${clip(label)}" comes before any Name line. Start each person with "Name: …".`,
      );
      continue;
    }
    if (value !== '') current.details.push({ label, value });
  }

  return { applicants, problems };
}

/** How a detail line appears on the cover: "alex@example.com" or "Current address: …". */
export function formatContactDetail(detail: ContactDetail): string {
  return VALUE_ONLY_LABELS.has(detail.label.toLowerCase()) ? detail.value : `${detail.label}: ${detail.value}`;
}

function clip(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}
