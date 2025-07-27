import { AdvancedRooms } from './Room';
import { AdvancedMessages } from '@/model/Message';

// send event(emit)
// emit
export interface ServerToClientEvents {
  message: (data: { room?: AdvancedRooms; message?: AdvancedMessages }) => void;
  reaction: (data: { message?: AdvancedMessages }) => void;
}

// on
export interface ClientToServerEvents {
  message: (
    data: {
      roomid: AdvancedMessages['roomid'];
      senderid: AdvancedMessages['senderid'];
      content: AdvancedMessages['content'];
      parentid: AdvancedMessages['parentid'];
      media: MessageMediaData | null;
    },
    callback: (message?: AdvancedMessages) => void
  ) => void;
  reaction: (
    data: {
      type: 'add' | 'undo';
      roomid: AdvancedMessages['roomid'];
      messageid: AdvancedMessages['id'];
      content?: AdvancedMessages['React'][0]['content'];
    },
    callback: (data: AdvancedMessages | undefined) => void
  ) => void;
}

// ping event
// io.on('ping', () => {})
export interface InterServerEvents {
  ping: () => void;
}

// socket.data.name
// socket.data.age
export interface SocketData {
  sessionId: string;
}

interface Gif {
  type: 'gif';
  url: string;
  width: number;
  height: number;
}

interface Image {
  type: 'image';
  url: string;
  width: number;
  height: number;
  file: Buffer;
  filename: string;
}

export type MessageMediaData = Gif | Image;
