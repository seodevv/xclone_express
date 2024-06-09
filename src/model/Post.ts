import { PostImage } from './PostImage';
import { User, UserId } from './User';

export interface Post {
  postId: number;
  User: Pick<User, 'id' | 'nickname' | 'image'>;
  content: string;
  Images: PostImage[];
  createAt: Date;
  Hearts: UserId[];
  Reposts: UserId[];
  Comments: UserId[];
  _count?: {
    Hearts: number;
    Reposts: number;
    Comments: number;
  };
  Parent?: {
    postId: Post['postId'];
    User: User;
    images: PostImage[];
  };
  Original?: Post;
}
