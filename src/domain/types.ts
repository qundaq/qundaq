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
  | { type: 'pump'; mlLeft?: number; mlRight?: number }
  | { type: 'growth'; weightG?: number; heightMm?: number; headMm?: number }
  | { type: 'temperature'; celsius: number }
  | { type: 'medication'; name: string; dose?: string }
  | { type: 'healthNote' };

export type EventType = EventPayload['type'];

interface EventTiming {
  babyId: Id | null; // null only for 'pump' (the parent's record)
  startAt: number;
  endAt?: number; // undefined on a running sleep/breastfeed
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

/** One layer of a saved mix: a sound and its slider value (0..1). */
export interface MixLayer {
  soundId: string;
  gain: number;
}

/** A saved sound mix (Sesler → Karışımı kaydet). Stores neither the master level nor the timer. */
export interface Mix {
  id: Id;
  name: string;
  layers: MixLayer[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}
