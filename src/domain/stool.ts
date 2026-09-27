import type { StoolColor } from './types';

// Order follows the familiar "stool color card": normal colors first, then warning colors.
export const STOOL_COLORS: readonly { id: StoolColor; hex: string }[] = [
  { id: 'yellow', hex: '#e8c547' },
  { id: 'mustard', hex: '#c9a227' },
  { id: 'green', hex: '#6b8e23' },
  { id: 'brown', hex: '#8b5a2b' },
  { id: 'pale-yellow', hex: '#f3eab5' },
  { id: 'clay', hex: '#c8bfae' },
  { id: 'white', hex: '#f5f5f0' },
  { id: 'red', hex: '#b22222' },
  { id: 'black', hex: '#1c1c1c' },
];

/** The colour card's two groups: the usual colours, and the ones a doctor should hear about (stoolAlert). */
export const STOOL_GROUPS: { usual: readonly StoolColor[]; doctor: readonly StoolColor[] } = {
  usual: ['yellow', 'mustard', 'green', 'brown'],
  doctor: ['pale-yellow', 'clay', 'white', 'red', 'black'],
};

export type StoolAlert = 'pale' | 'blood' | 'black';

/** Pale/white/clay stool can signal biliary atresia; red can be blood; black is normal only as meconium. */
export function stoolAlert(color: StoolColor | undefined): StoolAlert | null {
  switch (color) {
    case 'white':
    case 'pale-yellow':
    case 'clay':
      return 'pale';
    case 'red':
      return 'blood';
    case 'black':
      return 'black';
    default:
      return null;
  }
}
