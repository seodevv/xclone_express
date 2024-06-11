import { SafeUser, User } from './User';

export interface Room {
  receiverId: User['id'];
  senderId: User['id'];
  room: string;
  content: string;
  createdAt: Date;
  editAt: Date;
}

export interface AdvancedRoom extends Room {
  Receiver: SafeUser;
  Sender: SafeUser;
}
