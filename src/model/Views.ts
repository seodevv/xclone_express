import { Post } from '@/model/Post';

export interface Views {
  postId: Post['postId'];
  impressions: number;
  engagements: number;
  detailExpands: number;
  newFollowers: number;
  profileVisit: number;
}
