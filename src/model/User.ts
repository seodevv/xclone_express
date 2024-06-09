export interface UserId {
  id: User['id'];
}

export interface User {
  id: string;
  password: string;
  nickname: string;
  image: string;
}

export interface SafeUser extends Omit<User, 'password'> {}
export interface AdvancedUser extends SafeUser {
  Followers: UserId[];
  _count: {
    Followers: number;
    Followings: number;
  };
}
