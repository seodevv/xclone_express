import { Schemas } from '@/db/schema';

export type Reactions = Schemas['reactions'];

export const isReactionType = (str?: string): Reactions['type'] => {
  if (
    str === 'Heart' ||
    str === 'Comment' ||
    str === 'Repost' ||
    str === 'Bookmark'
  ) {
    return str;
  }
  return 'Heart';
};
