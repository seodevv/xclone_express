import { Post } from './Post';
import { User } from './User';

export interface Reactions {
  id: number;
  type: string;
  postId: Post['postId'];
  commentId?: Post['postId'];
  userId: User['id'];
}
