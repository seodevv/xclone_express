import { PostImage } from './PostImage';
import { SafeUser, UserId } from './User';

export interface Post {
  postId: number;
  userId: string;
  content: string;
  images: PostImage[];
  createAt: Date;
  parentId?: Post['postId'];
  originalId?: Post['postId'];
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
  Parent?: {
    postId: Post['postId'];
    User: SafeUser;
    images: PostImage[];
  };
  Original?: AdvancedPost;
}
