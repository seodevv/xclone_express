export interface UserId {
  id: User['id'];
}

export interface User {
  id: string;
  password?: string;
  nickname: string;
  image: string;
  Followers?: UserId[];
  _count?: {
    Followers: number;
    Followings: number;
  };
}
