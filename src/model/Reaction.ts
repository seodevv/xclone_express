import { Post } from './Post';
import { User } from './User';

export interface Reactions {
  id: number;
  postId: Post['postId'];
  type: string;
  userId: User['id'];
}
