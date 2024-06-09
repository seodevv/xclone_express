import { PostImage } from './PostImage';
import { SafeUser, UserId } from './User';

export interface Post {
  postId: number;
  userId: string;
  content: string;
  Images: PostImage[];
  createAt: Date;
  ParentId?: Post['postId'];
  OriginalId?: Post['postId'];
}

export interface AdvancedPost extends Post {
  User: SafeUser;
  Hearts: UserId[];
  Reposts: UserId[];
  Comments: UserId[];
  _count: {
    Hearts: number;
    Reposts: number;
    Comments: number;
  };
}
