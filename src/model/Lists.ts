import { SafeUser, Schemas } from '@/db/schema';
import { Post } from '@/model/Post';
import { User, UserId } from '@/model/User';

export type Lists = Schemas['lists'];

export interface AdvancedLists extends Lists {
  User: SafeUser;
  Member: UserId[];
  Follower: UserId[];
  Posts: Post['postid'][];
  UnShow: UserId[];
  Pinned: boolean;
}

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
