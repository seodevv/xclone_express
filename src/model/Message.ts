import { Room } from './Room';
import { User } from './User';

export interface Message {
  messageId: number;
  content: string;
  senderId: User['id'];
  room: Room['room'];
  createdAt: Date;
}
