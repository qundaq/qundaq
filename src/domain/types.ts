export type Id = string;

export interface Baby {
  id: Id;
  name: string;
  color: string; // hex, e.g. '#7cb7ff'
  birthDate?: string; // YYYY-MM-DD
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export type Side = 'L' | 'R';
/** The side(s) a running pump is on: 'B' is both breasts at once. */
export type PumpSide = Side | 'B';
export type StoolColor =
  'yellow' | 'mustard' | 'green' | 'brown' | 'pale-yellow' | 'clay' | 'white' | 'red' | 'black';
export type Consistency = 'watery' | 'soft' | 'formed' | 'hard';
export type BottleContents = 'breastmilk' | 'formula' | 'mixed';

export interface BreastSegment {
  side: Side;
  start: number;
  end?: number;
}

export type EventPayload =
  | { type: 'sleep' }
  | { type: 'breastfeed'; segments: BreastSegment[] }
  | { type: 'bottle'; ml: number; contents: BottleContents }
  | {
      type: 'diaper';
      wet: boolean;
      dirty: boolean;
      stoolColor?: StoolColor;
      consistency?: Consistency;
    }
  | {
      type: 'pump';
      minLeft?: number; // whole minutes per side
      minRight?: number;
      mlLeft?: number;
      mlRight?: number;
      side?: PumpSide; // only while the pump timer runs
    }
  | { type: 'growth'; weightG?: number; heightMm?: number; headMm?: number }
  | { type: 'temperature'; celsius: number }
  | { type: 'medication'; name: string; dose?: string }
  | { type: 'healthNote' };

export type EventType = EventPayload['type'];

interface EventTiming {
  babyId: Id | null; // null only for 'pump' (the parent's record)
  startAt: number;
  endAt?: number; // undefined on a running sleep/breastfeed/pump
  note?: string;
}

/** What the UI hands to the repository: no id, no bookkeeping fields. */
export type EventDraft = EventTiming & EventPayload;

export type TrackerEvent = EventDraft & {
  id: Id;
  groupId?: Id; // shared by events logged together with "All"
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
};

export type GrowthEvent = Extract<TrackerEvent, { type: 'growth' }>;
export type MedicationEvent = Extract<TrackerEvent, { type: 'medication' }>;
