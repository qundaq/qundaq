import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/domain/rules';
import { HOUR, MINUTE, toLocalInputValue } from '../../src/domain/time';
import type { EventDraft, TrackerEvent } from '../../src/domain/types';
import {
  addSegment,
  editedOptionalTime,
  editedTime,
  eventToInput,
  inputToDraft,
  pumpedTogether,
  removeSegment,
  segmentMinutes,
  segmentsChanged,
  setSegmentMinutes,
  setSegmentSide,
  type BreastfeedEdit,
  type PumpEdit,
  type SleepEdit,
} from '../../src/ui/log/edits';

const T0 = new Date(2026, 8, 25, 8, 0).getTime();
const SECOND = 1000;

function saved(draft: EventDraft): TrackerEvent {
  return { ...draft, id: 'e1', createdAt: T0, updatedAt: T0 };
}

/** The draft part of a stored entry: everything but the bookkeeping fields. */
function draftOf(event: TrackerEvent): EventDraft {
  /* eslint-disable @typescript-eslint/no-unused-vars -- destructured only to drop the properties */
  const {
    id: _id,
    groupId: _groupId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    deletedAt: _deletedAt,
    ...draft
  } = event;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  return draft;
}

const SWITCH_AT = T0 + 7 * MINUTE + 3 * SECOND;
const RUNNING_FEED = saved({
  type: 'breastfeed',
  babyId: 'a',
  startAt: T0,
  segments: [
    { side: 'L', start: T0, end: SWITCH_AT },
    { side: 'R', start: SWITCH_AT },
  ],
});
// Left 10 min, a 2-minute pause, right 20 seconds, a pause, left 7 min 5 s.
const FINISHED_FEED = saved({
  type: 'breastfeed',
  babyId: 'a',
  startAt: T0,
  endAt: T0 + 22 * MINUTE + 5 * SECOND,
  segments: [
    { side: 'L', start: T0, end: T0 + 10 * MINUTE },
    { side: 'R', start: T0 + 12 * MINUTE, end: T0 + 12 * MINUTE + 20 * SECOND },
    { side: 'L', start: T0 + 15 * MINUTE, end: T0 + 22 * MINUTE + 5 * SECOND },
  ],
});
const TIMED_PUMP = saved({
  type: 'pump',
  babyId: null,
  startAt: T0,
  endAt: T0 + 12 * MINUTE + 29 * SECOND,
  minLeft: 12,
  mlLeft: 50,
});
const RUNNING_SLEEP = saved({ type: 'sleep', babyId: 'a', startAt: T0 + 17 * SECOND });
const GROWTH = saved({
  type: 'growth',
  babyId: 'a',
  startAt: T0,
  weightG: 3453,
  heightMm: 525,
  headMm: 350,
});

const EVERY_TYPE: [string, TrackerEvent][] = [
  ['a running sleep', RUNNING_SLEEP],
  [
    'a finished sleep with a note',
    saved({
      type: 'sleep',
      babyId: 'a',
      startAt: T0,
      endAt: T0 + 95 * MINUTE + 17 * SECOND,
      note: 'Slept restlessly',
    }),
  ],
  ['a running breastfeed', RUNNING_FEED],
  ['a finished breastfeed with pauses and a sub-minute side', FINISHED_FEED],
  ['a bottle', saved({ type: 'bottle', babyId: 'a', startAt: T0, ml: 90, contents: 'formula' })],
  ['a wet diaper', saved({ type: 'diaper', babyId: 'a', startAt: T0, wet: true, dirty: false })],
  [
    'a dirty diaper with stool details and a note',
    saved({
      type: 'diaper',
      babyId: 'a',
      startAt: T0,
      wet: false,
      dirty: true,
      stoolColor: 'mustard',
      consistency: 'soft',
      note: 'Az',
    }),
  ],
  [
    'a pump with one side',
    saved({ type: 'pump', babyId: null, startAt: T0, endAt: T0, mlLeft: 60 }),
  ],
  [
    'a pump with both sides',
    saved({ type: 'pump', babyId: null, startAt: T0, endAt: T0, mlLeft: 60, mlRight: 45 }),
  ],
  ['a finished pump timer with seconds and ml added', TIMED_PUMP],
  [
    'a pump timer on both sides at once',
    saved({
      type: 'pump',
      babyId: null,
      startAt: T0,
      endAt: T0 + 20 * MINUTE,
      minLeft: 20,
      minRight: 20,
    }),
  ],
  [
    'a running pump',
    saved({ type: 'pump', babyId: null, startAt: T0 + 17 * SECOND, side: 'B', note: 'evening' }),
  ],
  ['growth with every measurement', GROWTH],
  [
    'growth with the weight only',
    saved({ type: 'growth', babyId: 'a', startAt: T0, weightG: 4100 }),
  ],
  ['a temperature', saved({ type: 'temperature', babyId: 'a', startAt: T0, celsius: 38.2 })],
  [
    'a medicine with a dose',
    saved({ type: 'medication', babyId: 'a', startAt: T0, name: 'Vitamin D', dose: '400 IU' }),
  ],
  [
    'a medicine without a dose',
    saved({ type: 'medication', babyId: 'a', startAt: T0, name: 'Paracetamol' }),
  ],
  [
    'a health note',
    saved({
      type: 'healthNote',
      babyId: 'a',
      startAt: T0,
      note: 'Vaccine given\nMild redness on the arm',
    }),
  ],
];

describe('eventToInput → inputToDraft', () => {
  it.each(EVERY_TYPE)('%s comes back unchanged, to the millisecond', (_label, event) => {
    expect(inputToDraft(eventToInput(event))).toStrictEqual(draftOf(event));
    expect(inputToDraft(eventToInput(event, ','))).toStrictEqual(draftOf(event));
  });

  it('shows decimals with the chosen separator', () => {
    expect(eventToInput(GROWTH, ',')).toMatchObject({
      value: { weightKg: '3,453', heightCm: '52,5', headCm: '35' },
    });
    expect(eventToInput(GROWTH, '.')).toMatchObject({
      value: { weightKg: '3.453', heightCm: '52.5', headCm: '35' },
    });
  });

  it('shows segment minutes rounded and never below 1', () => {
    expect((eventToInput(FINISHED_FEED) as BreastfeedEdit).segments).toEqual([
      { side: 'L', minutes: 10 },
      { side: 'R', minutes: 1 },
      { side: 'L', minutes: 7 },
    ]);
    expect(segmentMinutes(20 * SECOND)).toBe(1);
    expect(segmentMinutes(90 * SECOND)).toBe(2);
  });
});

describe('breastfeed edits', () => {
  it('moving the start of a finished feed keeps every side and pause, shifted', () => {
    const input = eventToInput(FINISHED_FEED) as BreastfeedEdit;
    expect(inputToDraft({ ...input, startAt: T0 - 30 * MINUTE })).toStrictEqual({
      type: 'breastfeed',
      babyId: 'a',
      startAt: T0 - 30 * MINUTE,
      endAt: T0 - 8 * MINUTE + 5 * SECOND,
      segments: [
        { side: 'L', start: T0 - 30 * MINUTE, end: T0 - 20 * MINUTE },
        { side: 'R', start: T0 - 18 * MINUTE, end: T0 - 18 * MINUTE + 20 * SECOND },
        { side: 'L', start: T0 - 15 * MINUTE, end: T0 - 8 * MINUTE + 5 * SECOND },
      ],
    });
  });

  it('changing minutes lays the sides back to back from the start', () => {
    const input = setSegmentMinutes(eventToInput(FINISHED_FEED) as BreastfeedEdit, 0, 12);
    expect(inputToDraft(input)).toStrictEqual({
      type: 'breastfeed',
      babyId: 'a',
      startAt: T0,
      endAt: T0 + 20 * MINUTE,
      segments: [
        { side: 'L', start: T0, end: T0 + 12 * MINUTE },
        { side: 'R', start: T0 + 12 * MINUTE, end: T0 + 13 * MINUTE },
        { side: 'L', start: T0 + 13 * MINUTE, end: T0 + 20 * MINUTE },
      ],
    });
  });

  it('changing a side is an edit too', () => {
    const input = setSegmentSide(eventToInput(FINISHED_FEED) as BreastfeedEdit, 1, 'L');
    expect(segmentsChanged(input)).toBe(true);
    expect(inputToDraft(input)).toMatchObject({
      segments: [{ side: 'L' }, { side: 'L' }, { side: 'L' }],
    });
  });

  it('an edit that is undone leaves the exact timing alone', () => {
    const input = eventToInput(FINISHED_FEED) as BreastfeedEdit;
    const undone = [
      removeSegment(addSegment(input), 3),
      setSegmentSide(setSegmentSide(input, 1, 'L'), 1, 'R'),
      setSegmentMinutes(setSegmentMinutes(input, 0, 11), 0, 10),
    ];
    for (const edited of undone) {
      expect(segmentsChanged(edited)).toBe(false);
      expect(inputToDraft(edited)).toStrictEqual(draftOf(FINISHED_FEED));
      expect(JSON.stringify(edited)).toBe(JSON.stringify(input)); // the edit sheet sees no unsaved change
    }
  });

  it('a finished feed whose last side has no end (a bad import) still takes edited minutes', () => {
    const broken = saved({
      type: 'breastfeed',
      babyId: 'a',
      startAt: T0,
      endAt: T0 + 10 * MINUTE,
      segments: [{ side: 'L', start: T0 }],
    });
    const input = setSegmentMinutes(eventToInput(broken) as BreastfeedEdit, 0, 9);
    expect(input.running).toBe(false);
    expect(inputToDraft(input)).toStrictEqual({
      type: 'breastfeed',
      babyId: 'a',
      startAt: T0,
      endAt: T0 + 9 * MINUTE,
      segments: [{ side: 'L', start: T0, end: T0 + 9 * MINUTE }],
    });
  });

  it('an empty or zero minutes field is refused with segments-invalid', () => {
    const input = setSegmentMinutes(eventToInput(FINISHED_FEED) as BreastfeedEdit, 1, 0);
    expect(() => inputToDraft(input)).toThrow(ValidationError);
    expect(() => inputToDraft(input)).toThrow('Validation failed: segments-invalid');
  });

  it('an added side alternates; removing always leaves one', () => {
    const single = saved({
      type: 'breastfeed',
      babyId: 'a',
      startAt: T0,
      endAt: T0 + 5 * MINUTE,
      segments: [{ side: 'R', start: T0, end: T0 + 5 * MINUTE }],
    });
    let input = addSegment(eventToInput(single) as BreastfeedEdit);
    expect(input.segments).toEqual([
      { side: 'R', minutes: 5 },
      { side: 'L', minutes: 0 },
    ]);
    input = removeSegment(input, 0);
    expect(input.segments).toEqual([{ side: 'L', minutes: 0 }]);
    expect(removeSegment(input, 0)).toBe(input);
  });

  it('a running feed: the start moves the first side, the current side can be corrected, an end closes it', () => {
    const input = setSegmentSide(eventToInput(RUNNING_FEED) as BreastfeedEdit, 1, 'L');
    expect(inputToDraft({ ...input, startAt: T0 - 5 * MINUTE })).toStrictEqual({
      type: 'breastfeed',
      babyId: 'a',
      startAt: T0 - 5 * MINUTE,
      segments: [
        { side: 'L', start: T0 - 5 * MINUTE, end: SWITCH_AT },
        { side: 'L', start: SWITCH_AT },
      ],
    });
    expect(inputToDraft({ ...input, endAt: T0 + 20 * MINUTE })).toStrictEqual({
      type: 'breastfeed',
      babyId: 'a',
      startAt: T0,
      endAt: T0 + 20 * MINUTE,
      segments: [
        { side: 'L', start: T0, end: SWITCH_AT },
        { side: 'L', start: SWITCH_AT, end: T0 + 20 * MINUTE },
      ],
    });
  });
});

describe('pump edits', () => {
  const LENGTH = 12 * MINUTE + 29 * SECOND;
  const pumpInput = (event: TrackerEvent) => eventToInput(event) as PumpEdit;

  it('moving the end of a finished pump keeps its length, seconds included', () => {
    const input = pumpInput(TIMED_PUMP);
    expect(inputToDraft({ ...input, endAt: T0 + LENGTH + HOUR })).toStrictEqual({
      ...draftOf(TIMED_PUMP),
      startAt: T0 + HOUR,
      endAt: T0 + LENGTH + HOUR,
    });
  });

  it('an ml change keeps the timing as stored', () => {
    const input = pumpInput(TIMED_PUMP);
    expect(inputToDraft({ ...input, value: { ...input.value, mlRight: '30' } })).toStrictEqual({
      ...draftOf(TIMED_PUMP),
      mlRight: 30,
    });
  });

  it('changed minutes put the start their sum before the end (one side after the other)', () => {
    const input = pumpInput(TIMED_PUMP);
    expect(inputToDraft({ ...input, value: { ...input.value, minRight: 8 } })).toStrictEqual({
      ...draftOf(TIMED_PUMP),
      startAt: T0 + LENGTH - 20 * MINUTE,
      minRight: 8,
    });
    expect(
      inputToDraft({ ...input, value: { ...input.value, minLeft: null, mlLeft: '' } }),
    ).toStrictEqual({ type: 'pump', babyId: null, startAt: T0 + LENGTH, endAt: T0 + LENGTH });
  });

  it('edits minutes only, ml only, or both, on a pump that had only minutes', () => {
    const minutesOnly = saved({
      type: 'pump',
      babyId: null,
      startAt: T0,
      endAt: T0 + 10 * MINUTE,
      minLeft: 10,
    });
    const input = pumpInput(minutesOnly);
    expect(input.value).toEqual({ minLeft: 10, minRight: null, mlLeft: '', mlRight: '' });
    expect(inputToDraft({ ...input, value: { ...input.value, minLeft: 15 } })).toStrictEqual({
      ...draftOf(minutesOnly),
      startAt: T0 - 5 * MINUTE,
      minLeft: 15,
    });
    expect(inputToDraft({ ...input, value: { ...input.value, mlRight: '70' } })).toStrictEqual({
      ...draftOf(minutesOnly),
      mlRight: 70,
    });
    expect(
      inputToDraft({ ...input, value: { minLeft: 8, minRight: 4, mlLeft: '30', mlRight: '' } }),
    ).toStrictEqual({
      ...draftOf(minutesOnly),
      startAt: T0 - 2 * MINUTE,
      minLeft: 8,
      minRight: 4,
      mlLeft: 30,
    });
  });

  it('an ml-only pump stays a moment while it has no minutes, and gets its length from them', () => {
    const mlOnly = saved({ type: 'pump', babyId: null, startAt: T0, endAt: T0, mlLeft: 60 });
    const input = pumpInput(mlOnly);
    expect(inputToDraft({ ...input, value: { ...input.value, mlLeft: '80' } })).toStrictEqual({
      ...draftOf(mlOnly),
      mlLeft: 80,
    });
    expect(inputToDraft({ ...input, value: { ...input.value, minRight: 12 } })).toStrictEqual({
      ...draftOf(mlOnly),
      startAt: T0 - 12 * MINUTE,
      minRight: 12,
    });
  });

  it('sides pumped at the same time: a changed side sets the length by the longer side, never their sum', () => {
    const LENGTH = 20 * MINUTE + 13 * SECOND;
    const pumped = (endAt: number, minLeft: number, minRight?: number) =>
      saved({ type: 'pump', babyId: null, startAt: T0, endAt, minLeft, minRight });
    const both = pumped(T0 + LENGTH, 20, 20);
    const input = pumpInput(both);
    expect(pumpedTogether(input.stored)).toBe(true);
    const end = T0 + LENGTH;
    expect(inputToDraft({ ...input, value: { ...input.value, minLeft: 21 } })).toMatchObject({
      startAt: end - 21 * MINUTE,
      endAt: end,
      minLeft: 21,
      minRight: 20,
    });
    expect(inputToDraft({ ...input, value: { ...input.value, minRight: null } })).toMatchObject({
      startAt: end - 20 * MINUTE,
    });
    // Two hours on both sides stays two hours: not refused as longer than four.
    const long = pumpInput(pumped(T0 + 2 * HOUR, 120, 120));
    expect(inputToDraft({ ...long, value: { ...long.value, minLeft: 125 } })).toMatchObject({
      startAt: T0 + 2 * HOUR - 125 * MINUTE,
    });
    // One side after the other (the session as long as both together) keeps the sum.
    expect(pumpedTogether(pumpInput(pumped(T0 + 40 * MINUTE, 20, 20)).stored)).toBe(false);
    expect(pumpedTogether(pumpInput(pumped(T0 + LENGTH, 20)).stored)).toBe(false);
  });

  it('a running pump: the start moves and the side stays', () => {
    const running = saved({ type: 'pump', babyId: null, startAt: T0, side: 'R' });
    const input = pumpInput(running);
    expect(input).toMatchObject({ startAt: T0, endAt: null, side: 'R' });
    expect(inputToDraft({ ...input, startAt: T0 - MINUTE })).toStrictEqual({
      ...draftOf(running),
      startAt: T0 - MINUTE,
    });
  });
});

describe('sleep edits', () => {
  it('a chosen end finishes a running sleep', () => {
    const input = eventToInput(RUNNING_SLEEP) as SleepEdit;
    expect(inputToDraft({ ...input, endAt: T0 + HOUR })).toStrictEqual({
      type: 'sleep',
      babyId: 'a',
      startAt: T0 + 17 * SECOND,
      endAt: T0 + HOUR,
    });
  });
});

describe('edit sheet time fields', () => {
  const stored = T0 + 17 * SECOND + 123;
  const nineThirty = () => new Date(2026, 8, 25, 9, 30).getTime();

  it('keep the stored instant, seconds included, while the shown value is unchanged', () => {
    expect(editedTime(toLocalInputValue(stored), stored)).toBe(stored);
    expect(editedOptionalTime(toLocalInputValue(stored), stored)).toBe(stored);
  });

  it('changed and changed back, return the stored instant, seconds included', () => {
    const changed = editedTime('2026-09-25T09:30', stored, stored);
    expect(changed).toBe(nineThirty());
    expect(editedTime(toLocalInputValue(stored), changed, stored)).toBe(stored);
  });

  it('changed and changed back, leave the edit equal to the stored entry (not dirty)', () => {
    const initial = eventToInput(RUNNING_SLEEP) as SleepEdit;
    const storedStart = RUNNING_SLEEP.startAt;
    const moved = {
      ...initial,
      startAt: editedTime('2026-09-25T09:30', initial.startAt, storedStart),
    };
    expect(moved).not.toEqual(initial);
    const back = {
      ...moved,
      startAt: editedTime(toLocalInputValue(storedStart), moved.startAt, storedStart),
    };
    expect(JSON.stringify(back)).toBe(JSON.stringify(initial));
  });

  it('take a new valid value; an emptied or broken field keeps the stored time', () => {
    expect(editedTime('2026-09-25T09:30', stored)).toBe(nineThirty());
    expect(editedTime('', stored)).toBe(stored);
    expect(editedTime('garbage', stored)).toBe(stored);
  });

  it('the optional end: emptied means no end', () => {
    expect(editedOptionalTime('', stored)).toBeNull();
    expect(editedOptionalTime('2026-09-25T09:30', null)).toBe(nineThirty());
    expect(editedOptionalTime('garbage', null)).toBeNull();
  });
});
