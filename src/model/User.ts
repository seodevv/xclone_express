export interface UserId {
  id: User['id'];
}

interface Verified {
  type: 'blue' | 'gold' | 'gray';
  date: Date;
}

interface Birth {
  date: string;
  scope: {
    month: 'public' | 'follower' | 'following' | 'each' | 'only';
    year: 'public' | 'follower' | 'following' | 'each' | 'only';
  };
}

export interface User {
  id: string;
  password: string;
  nickname: string;
  image: string;
  banner?: string;
  desc?: string;
  location?: string;
  birth?: Birth;
  refer?: string;
  verified?: Verified;
  regist: Date;
}

export interface SafeUser
  extends Pick<User, 'id' | 'nickname' | 'image' | 'verified'> {}
export interface AdvancedUser extends Omit<User, 'password'> {
  Followers: UserId[];
  Followings: UserId[];
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

export function isBirth(data?: {
  date: string;
  scope: { month: string; year: string };
}): data is Birth {
  if (typeof data === 'undefined') return false;

  const enumeration = ['public', 'follower', 'following', 'each', 'only'];
  return (
    enumeration.includes(data.scope.month) &&
    enumeration.includes(data.scope.year)
  );
}
