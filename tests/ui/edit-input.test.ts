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
  removeSegment,
  segmentMinutes,
  segmentsChanged,
  setSegmentMinutes,
  setSegmentSide,
  type BreastfeedEdit,
  type SleepEdit,
} from '../../src/ui/log/drafts';

const T0 = new Date(2026, 8, 25, 8, 0).getTime();
const SECOND = 1000;

function saved(draft: EventDraft): TrackerEvent {
  return { ...draft, id: 'e1', createdAt: T0, updatedAt: T0 } as TrackerEvent;
}

/** The draft part of a stored entry: everything but the bookkeeping fields. */
function draftOf(event: TrackerEvent): EventDraft {
  const {
    id: _id,
    groupId: _groupId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    deletedAt: _deletedAt,
    ...draft
  } = event;
  return draft as EventDraft;
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
      note: 'Huzursuz uyudu',
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
  ['a pump with one side', saved({ type: 'pump', babyId: null, startAt: T0, mlLeft: 60 })],
  [
    'a pump with both sides',
    saved({ type: 'pump', babyId: null, startAt: T0, mlLeft: 60, mlRight: 45 }),
  ],
  ['growth with every measurement', GROWTH],
  [
    'growth with the weight only',
    saved({ type: 'growth', babyId: 'a', startAt: T0, weightG: 4100 }),
  ],
  ['a temperature', saved({ type: 'temperature', babyId: 'a', startAt: T0, celsius: 38.2 })],
  [
    'a medicine with a dose',
    saved({ type: 'medication', babyId: 'a', startAt: T0, name: 'D vitamini', dose: '400 IU' }),
  ],
  [
    'a medicine without a dose',
    saved({ type: 'medication', babyId: 'a', startAt: T0, name: 'Parasetamol' }),
  ],
  [
    'a health note',
    saved({
      type: 'healthNote',
      babyId: 'a',
      startAt: T0,
      note: 'Aşı yapıldı\nKolunda hafif kızarıklık',
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
