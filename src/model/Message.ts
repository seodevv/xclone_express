import { Room } from './Room';
import { User } from './User';

export interface Message {
  messageId: number;
  room: Room['room'];
  senderId: User['id'];
  content: string;
  createdAt: Date;
}
