import { SafeUser, User } from './User';

export interface Room {
  ReceiverId: User['id'];
  SenderId: User['id'];
  room: string;
  content: string;
  createdAt: Date;
}

export interface AdvancedRoom extends Room {
  Receiver: SafeUser;
  Sender: SafeUser;
}
