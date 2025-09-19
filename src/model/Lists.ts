import { Schemas } from '@/db/schema';

export type Lists = Schemas['lists'];
export type AdvancedLists = Schemas['advancedlists'] & { Pinned: boolean };
export type ListsDetail = Schemas['listsdetail'];
