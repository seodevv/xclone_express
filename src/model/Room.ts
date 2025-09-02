import { Schemas } from '@/db/schema';

export type Room = Schemas['rooms'];
export type AdvancedRooms = Schemas['advancedrooms'] & {
  lastmessageid: number | null;
  lastmessagesenderid: string | null;
  type: 'gif' | 'image' | null;
  content: string | null;
  lastat: Date | null;
  Pinned: boolean;
  Disabled: boolean;
  Snooze: {
    type: Schemas['roomssnooze']['type'];
    createat: Date;
  } | null;
};
export type RoomsNotifications = {
  id: AdvancedRooms['id'];
  Notifications: number;
};
