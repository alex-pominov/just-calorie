import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

import { fontSize } from '@/modules/theme';

// Without the design's font-size names, tailwind-merge reads `text-label` as a text COLOUR
// and silently drops it next to `text-primary`.
const twMerge = extendTailwindMerge({ extend: { theme: { text: Object.keys(fontSize) } } });

export const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args));
