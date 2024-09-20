import { Post } from '@/model/Post';
import { SafeUser, User, UserId } from '@/model/User';

export interface ListsRaw {
  id: number;
  userId: User['id'];
  name: string;
  description: string;
  banner: string;
  thumbnail: string;
  make: string;
  createAt: Date;
}

export interface Lists extends ListsRaw {
  make: 'private' | 'public';
}

export interface AdvancedLists extends Lists {
  User: SafeUser;
  Member: UserId[];
  Follower: UserId[];
  Posts: Post['postId'][];
  UnShow: UserId[];
  Pinned: boolean;
}

export interface ListsDetailRaw {
  id: number;
  listId: Lists['id'];
  type: string;
  userId: User['id'];
  postId?: Post['postId'];
}

export interface ListsDetail extends ListsDetailRaw {
  type: 'member' | 'post' | 'unpost' | 'follower' | 'pinned' | 'unshow';
}
