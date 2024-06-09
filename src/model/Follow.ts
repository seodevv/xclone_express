import { User } from './User';

export interface Follow {
  id: number;
  source: User['id'];
  target: User['id'];
  createAt: Date;
}
