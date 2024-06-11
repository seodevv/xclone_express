import { SafeUser, User } from './User';

export interface Room {
  room: string;
  receiverId: User['id'];
  senderId: User['id'];
  content: string;
  createdAt: Date;
}

export interface AdvancedRoom extends Room {
  Receiver: SafeUser;
  Sender: SafeUser;
}
