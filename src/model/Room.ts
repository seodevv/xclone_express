import { SafeUser, Schemas } from '@/db/schema';

export type Room = Schemas['rooms'];

export interface AdvancedRoom extends Room {
  Receiver: SafeUser;
  Sender: SafeUser;
}
