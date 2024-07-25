export interface UserId {
  id: User['id'];
}

export interface User {
  id: string;
  password: string;
  nickname: string;
  image: string;
  banner?: string;
  desc?: string;
  refer?: string;
  regist: Date;
}

export interface SafeUser extends Pick<User, 'id' | 'nickname' | 'image'> {}
export interface AdvancedUser extends Omit<User, 'password'> {
  Followers: UserId[];
  _count: {
    Followers: number;
    Followings: number;
  };
}
