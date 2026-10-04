import { describe, expect, it } from 'vitest';
import { CONTACT_FILE_EXAMPLE, formatContactDetail, parseContactInfo } from '../../src/core/contactInfo';

describe('parseContactInfo', () => {
  it('reads the documented example', () => {
    const { applicants, problems } = parseContactInfo(CONTACT_FILE_EXAMPLE);
    expect(problems).toEqual([]);
    expect(applicants).toEqual([
      {
        name: 'Noah Example',
        details: [
          { label: 'Email', value: 'noah@example.com' },
          { label: 'Phone', value: '(555) 010-2481' },
        ],
      },
      {
        name: 'Anna Example',
        details: [
          { label: 'Email', value: 'anna@example.com' },
          { label: 'Phone', value: '(555) 010-7730' },
        ],
      },
    ]);
  });

  it('is forgiving about spacing, case, comments, BOM and line endings', () => {
    const text = '﻿# our info\r\n  name :  Noah  \r\nEMAIL: n@x.com\r\n\r\n\r\nNAME: Anna\rphone: 1';
    const { applicants, problems } = parseContactInfo(text);
    expect(problems).toEqual([]);
    expect(applicants.map((a) => a.name)).toEqual(['Noah', 'Anna']);
    expect(applicants[1]?.details).toEqual([{ label: 'phone', value: '1' }]);
  });

  it('starts a new person at every Name line, even without a blank line', () => {
    const { applicants } = parseContactInfo('Name: A\nEmail: a@x\nName: B\nEmail: b@x');
    expect(applicants.map((a) => [a.name, a.details[0]?.value])).toEqual([
      ['A', 'a@x'],
      ['B', 'b@x'],
    ]);
  });

  it('keeps extra labels and values containing colons', () => {
    const { applicants } = parseContactInfo('Name: A\nCurrent address: 1 Elm St\nNote: call after 5:30');
    expect(applicants[0]?.details).toEqual([
      { label: 'Current address', value: '1 Elm St' },
      { label: 'Note', value: 'call after 5:30' },
    ]);
  });

  it('explains lines it cannot use, with line numbers', () => {
    const { applicants, problems } = parseContactInfo('Email: orphan@x\nName:\nName: Real\njust some text');
    expect(applicants.map((a) => a.name)).toEqual(['Real']);
    expect(problems).toEqual([
      'Line 1: "Email" comes before any Name line. Start each person with "Name: …".',
      'Line 2: the Name is empty.',
      'Line 4: "just some text" needs a label, like "Phone: (555) 010-2481".',
    ]);
  });

  it('limits the number of people and the length of values', () => {
    const many = Array.from({ length: 10 }, (_, i) => `Name: P${i}`).join('\n\n');
    const { applicants, problems } = parseContactInfo(many);
    expect(applicants).toHaveLength(8);
    expect(problems).toHaveLength(2);
    expect(parseContactInfo(`Name: ${'x'.repeat(500)}`).applicants[0]?.name).toHaveLength(200);
  });

  it('returns nothing for an empty file', () => {
    expect(parseContactInfo('')).toEqual({ applicants: [], problems: [] });
  });

  it('prints email and phone as plain values, other details with their label', () => {
    expect(formatContactDetail({ label: 'Email', value: 'a@x' })).toBe('a@x');
    expect(formatContactDetail({ label: 'cell', value: '1' })).toBe('1');
    expect(formatContactDetail({ label: 'Current address', value: '1 Elm' })).toBe('Current address: 1 Elm');
  });
});
