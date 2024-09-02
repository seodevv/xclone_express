import { Post } from '@/model/Post';
import { User, UserId } from '@/model/User';

export interface ListsRaw {
  id: number;
  userId: User['id'];
  name: string;
  description: string;
  banner: string;
  thumbnail: string;
  make: string;
  pinned: boolean;
  createAt: Date;
}

export interface Lists extends ListsRaw {
  make: 'private' | 'public';
}

export interface AdvancedLists extends Lists {
  member: UserId[];
  follower: UserId[];
  posts: Post['postId'][];
}

export interface ListsDetailRaw {
  id: number;
  listId: Lists['id'];
  type: string;
  userId: User['id'];
  postId?: Post['postId'];
}

export interface ListsDetail extends ListsDetailRaw {
  type: 'member' | 'post' | 'follower';
}
