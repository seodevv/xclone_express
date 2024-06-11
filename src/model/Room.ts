import { SafeUser, User } from './User';

export interface Room {
  room: string;
  ReceiverId: User['id'];
  SenderId: User['id'];
  content: string;
  createdAt: Date;
}

export interface AdvancedRoom extends Room {
  Receiver: SafeUser;
  Sender: SafeUser;
}
