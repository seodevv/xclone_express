import { SafeUser, User } from './User';

export interface Room {
  room: string;
  receiverId: User['id'];
  senderId: User['id'];
  createdAt: Date;
  content?: string;
  lastAt?: Date;
}

export interface AdvancedRoom extends Room {
  Receiver: SafeUser;
  Sender: SafeUser;
}
