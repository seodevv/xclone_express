import { User, UserId } from './User';

export interface Room {
  Receiver: Pick<User, 'id' | 'nickname' | 'image'>;
  ReceiverId: UserId;
  Sender: Pick<User, 'id' | 'nickname' | 'image'>;
  SenderId: UserId;
  room: string;
  content: string;
  createdAt: Date;
}
