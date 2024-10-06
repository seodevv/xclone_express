import { Birth, Schemas, Verified } from '@/db/schema';

export interface UserId {
  id: User['id'];
}

export type User = Schemas['users'];
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
}): Verified | null {
  if (obj.type === 'blue' || obj.type === 'gold' || obj.type === 'gray') {
    return {
      type: obj.type,
      date: new Date(obj.date),
    };
  }
  return null;
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
