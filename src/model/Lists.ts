import { Schemas } from '@/db/schema';

export type Lists = Schemas['lists'];
export type AdvancedLists = Schemas['advancedLists'] & { Pinned: boolean };

export type ListsDetail = Schemas['listsdetail'];

export const isListsMake = (str?: string): Lists['make'] => {
  return str === 'private' ? 'private' : 'public';
};

export const isListsDetailType = (str?: string): ListsDetail['type'] => {
  if (
    str === 'member' ||
    str === 'post' ||
    str === 'unpost' ||
    str === 'follower' ||
    str === 'pinned'
  )
    return str;
  return 'member';
};
