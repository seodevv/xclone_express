export interface UserId {
  id: User['id'];
}

interface Verified {
  type: 'blue' | 'gold' | 'gray';
  date: Date;
}

export interface User {
  id: string;
  password: string;
  nickname: string;
  image: string;
  banner?: string;
  desc?: string;
  refer?: string;
  verified?: Verified;
  regist: Date;
}

export interface SafeUser
  extends Pick<User, 'id' | 'nickname' | 'image' | 'verified'> {}
export interface AdvancedUser extends Omit<User, 'password'> {
  Followers: UserId[];
  _count: {
    Followers: number;
    Followings: number;
  };
}

export function isVerified(obj: {
  type: string;
  date: string;
}): Verified | undefined {
  if (obj.type === 'blue' || obj.type === 'gold' || obj.type === 'gray') {
    return {
      type: obj.type,
      date: new Date(obj.date),
    };
  }
}
