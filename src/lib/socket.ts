import fs from 'fs-extra';
import path from 'path';
import { decryptRoomId } from '@/lib/common';
import DAO from '@/lib/DAO';
import { Server, Socket } from 'socket.io';
import { uploadPath } from '@/app';
import {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@/model/Socket';
import { createAdapter } from '@socket.io/postgres-adapter';
import { pool } from '@/db/env';

export function setupSocket(
  io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >
) {
  io.adapter(createAdapter(pool));

  io.of('/messages').on('connection', (socket) => {
    const sessionid = socket.handshake.auth.sessionId;
    socket.join(sessionid);

    console.log(`[${socket.id}][${sessionid}][${process.pid}] connected`);

    socket.on('message', async (data, callback) => {
      const { roomid, senderid, content, parentid, media } = data;
      const receiverid = decryptRoomId({ userid: senderid, roomid });

      const dao = new DAO();
      let findRoom = await dao.getAdvancedRoom({ sessionid, roomid });
      if (typeof findRoom === 'undefined') {
        findRoom = await dao.createRoom({
          sessionid,
          roomid,
          senderid,
          receiverid,
        });
      }

      await dao.roomsDetailHandler({
        method: 'delete',
        type: 'disable',
        roomid,
      });

      let createdMessage = await dao.createMessage({
        roomid,
        senderid,
        content,
        parentid,
      });

      if (typeof createdMessage !== 'undefined') {
        if (media) {
          let name = media.url;
          if (media.type === 'image') {
            name = `${Date.now()}_${media.filename}`;
            const filePath = path.join(uploadPath, name);
            fs.writeFileSync(filePath, media.file);
          }
          const temp = await dao.messagesMediaHandler({
            type: media.type,
            messageid: createdMessage.id,
            url: name,
            width: media.width,
            height: media.height,
          });
          if (typeof temp !== 'undefined') {
            createdMessage = temp;
          }
        }

        const updatedRoom = await dao.getAdvancedRoom({
          sessionid: receiverid,
          roomid,
        });
        io.of('/messages').to(receiverid).emit('message', {
          room: updatedRoom,
          message: createdMessage,
        });
      }

      dao.release();
      callback(createdMessage);
    });

    socket.on('reaction', async (data, callback) => {
      const { type, roomid, messageid, content } = data;
      const receiverid = decryptRoomId({ userid: sessionid, roomid });

      const dao = new DAO();
      const findRoom = await dao.getRoom({ roomid });
      if (typeof findRoom === 'undefined') {
        return callback(undefined);
      }

      const detail = await dao.getMessagesdetail({
        type: 'react',
        userid: sessionid,
        messageid,
      });

      switch (type) {
        case 'add': {
          const result = await dao.messagesDetailHandler({
            type: typeof detail === 'undefined' ? 'addReact' : 'updateReact',
            payload: {
              messageid,
              userid: sessionid,
              content,
            },
          });
          if (!result) {
            return callback(undefined);
          }
          break;
        }
        case 'undo': {
          await dao.messagesDetailHandler({
            type: 'removeReact',
            payload: {
              messageid,
              userid: sessionid,
            },
          });
          break;
        }
      }

      const updatedMessage = await dao.getMessage({ id: messageid });
      dao.release();

      callback(updatedMessage);

      io.of('/messages').to(receiverid).emit('reaction', {
        message: updatedMessage,
      });
    });

    socket.on('focus', async ({ roomid }, callback) => {
      const receiverid = decryptRoomId({ userid: sessionid, roomid });

      const dao = new DAO();
      const findRoom = await dao.getRoom({ roomid, findUserid: sessionid });
      if (findRoom) {
        dao.updateSeen({ roomid, sessionid });
      }
      dao.release();

      callback();

      io.of('/messages').to(receiverid).emit('focus', {
        roomid,
      });
    });
  });
}
