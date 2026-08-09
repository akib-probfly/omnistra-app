import type { ImageSourcePropType } from 'react-native';

export type InboxPatternId =
  | 'none'
  | 'marble'
  | 'artboard'
  | 'bacteria'
  | 'business'
  | 'business-icons'
  | 'dot'
  | 'geometry'
  | 'jamdani'
  | 'streamline';

export const DEFAULT_INBOX_PATTERN: InboxPatternId = 'streamline';

export type InboxPattern = {
  id: InboxPatternId;
  label: string;
  /** Settings tile thumbnail (cover). */
  thumbSource?: ImageSourcePropType;
  /** Conversation thread tile (repeat). */
  appSource?: ImageSourcePropType;
  /** Matches frontend CSS `background-size: Npx auto`. */
  tileWidth?: number;
  /** Fallback gradient when there is no image (None). */
  previewColors: string[];
  threadColor: string;
  threadAccent: string;
};

export const INBOX_PATTERNS: InboxPattern[] = [
  {
    id: 'none',
    label: 'None',
    previewColors: ['#F8F3EA', '#EEF7FF', '#FFFFFF'],
    threadColor: '#f8fbff',
    threadAccent: '#eef7ff',
  },
  {
    id: 'marble',
    label: 'Marbel',
    thumbSource: require('../../assets/inbox-patterns/bg-1-thumb.png'),
    appSource: require('../../assets/inbox-patterns/bg-1-app.png'),
    tileWidth: 300,
    previewColors: ['#efeae4', '#d9d2c8', '#f7f4f0'],
    threadColor: '#f4f1ec',
    threadAccent: '#e5dfd6',
  },
  {
    id: 'artboard',
    label: 'Artboard',
    thumbSource: require('../../assets/inbox-patterns/bg-2-thumb.png'),
    appSource: require('../../assets/inbox-patterns/bg-2-app.png'),
    tileWidth: 220,
    previewColors: ['#e8f1ff', '#d6e4ff', '#f5f8ff'],
    threadColor: '#f0f5ff',
    threadAccent: '#dbe7ff',
  },
  {
    id: 'bacteria',
    label: 'Bacteria',
    thumbSource: require('../../assets/inbox-patterns/bg-3-thumb.png'),
    appSource: require('../../assets/inbox-patterns/bg-3-app.png'),
    tileWidth: 240,
    previewColors: ['#e8f8f1', '#cfeedd', '#f3fcf7'],
    threadColor: '#f1faf5',
    threadAccent: '#d7f0e4',
  },
  {
    id: 'business',
    label: 'Business',
    thumbSource: require('../../assets/inbox-patterns/bg-4-thumb.png'),
    appSource: require('../../assets/inbox-patterns/bg-4-app.png'),
    tileWidth: 260,
    previewColors: ['#eef2f7', '#d7dee8', '#f8fafc'],
    threadColor: '#f5f7fa',
    threadAccent: '#e2e8f0',
  },
  {
    id: 'business-icons',
    label: 'Business Icons',
    thumbSource: require('../../assets/inbox-patterns/bg-5-thumb.png'),
    appSource: require('../../assets/inbox-patterns/bg-5-app.png'),
    tileWidth: 280,
    previewColors: ['#edf2ff', '#c7d7fe', '#f8faff'],
    threadColor: '#f3f6ff',
    threadAccent: '#dbe4ff',
  },
  {
    id: 'dot',
    label: 'Dot',
    thumbSource: require('../../assets/inbox-patterns/bg-6-thumb.png'),
    appSource: require('../../assets/inbox-patterns/bg-6-app.png'),
    tileWidth: 240,
    previewColors: ['#f1f5f9', '#cbd5e1', '#ffffff'],
    threadColor: '#f8fafc',
    threadAccent: '#e2e8f0',
  },
  {
    id: 'geometry',
    label: 'Geometry',
    thumbSource: require('../../assets/inbox-patterns/bg-7-thumb.png'),
    appSource: require('../../assets/inbox-patterns/bg-7-app.png'),
    tileWidth: 320,
    previewColors: ['#faf5ff', '#e9d5ff', '#ffffff'],
    threadColor: '#faf8ff',
    threadAccent: '#ede4ff',
  },
  {
    id: 'jamdani',
    label: 'Jamdani',
    thumbSource: require('../../assets/inbox-patterns/bg-8-thumb.png'),
    appSource: require('../../assets/inbox-patterns/bg-8-app.png'),
    tileWidth: 300,
    previewColors: ['#fff7ed', '#fdba74', '#fffbeb'],
    threadColor: '#fffaf3',
    threadAccent: '#ffe8cc',
  },
  {
    id: 'streamline',
    label: 'Streamline',
    thumbSource: require('../../assets/inbox-patterns/bg-8-thumb.png'),
    appSource: require('../../assets/inbox-patterns/bg-8-app.png'),
    tileWidth: 300,
    previewColors: ['#eff6ff', '#93c5fd', '#f8fafc'],
    threadColor: '#f5f9ff',
    threadAccent: '#dbeafe',
  },
];

export function getInboxPattern(pattern: InboxPatternId): InboxPattern {
  return INBOX_PATTERNS.find((item) => item.id === pattern)
    ?? INBOX_PATTERNS.find((item) => item.id === DEFAULT_INBOX_PATTERN)!;
}

export function parseInboxPattern(value: string | null | undefined): InboxPatternId {
  if (!value) return DEFAULT_INBOX_PATTERN;
  return INBOX_PATTERNS.some((item) => item.id === value)
    ? (value as InboxPatternId)
    : DEFAULT_INBOX_PATTERN;
}
