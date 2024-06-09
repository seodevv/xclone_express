import { Room } from './Room';
import { UserId } from './User';

export interface Message {
  messageId: number;
  content: string;
  senderId: UserId;
  receiverId: UserId;
  room: Room['room'];
  createdAt: Date;
}
