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

const clientSockets: Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>[] = [];

function addClientSocket(socket: (typeof clientSockets)[0]) {
  const index = clientSockets.findIndex(
    (clientSocket) =>
      clientSocket.handshake.auth.sessionId === socket.handshake.auth.sessionId
  );
  if (index > -1) {
    clientSockets[index] = socket;
  } else {
    clientSockets.push(socket);
  }
  console.log(
    `[${socket.id}][${socket.handshake.auth.sessionId}] a user connected`
  );
  console.log(
    `[client sockets] ${clientSockets
      .map((s) => s.handshake.auth.sessionId)
      .join(', ')}`
  );
}
function removeClientSocket(socket: (typeof clientSockets)[0]) {
  const index = clientSockets.findIndex(
    (clientSocket) =>
      clientSocket.handshake.auth.sessionId === socket.handshake.auth.sessionId
  );
  if (index > -1) {
    clientSockets.splice(index, 1);
  }
  console.log(
    `[${socket.id}][${socket.handshake.auth.sessionId}] user disconnected`
  );
  console.log(
    `[client sockets] ${clientSockets
      .map((s) => s.handshake.auth.sessionId)
      .join(', ')}`
  );
}

export function setupSocket(
  io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >
) {
  io.of('/messages').on('connection', (socket) => {
    addClientSocket(socket);
    const sessionid = socket.handshake.auth.sessionId;

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

        const target = clientSockets.find(
          (socket) => socket.handshake.auth.sessionId === receiverid
        );

        const updatedRoom = await dao.getAdvancedRoom({
          sessionid: receiverid,
          roomid,
        });
        if (typeof target !== 'undefined') {
          target.emit('message', {
            room: updatedRoom,
            message: createdMessage,
          });
        }
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
      const target = clientSockets.find(
        (socket) => socket.handshake.auth.sessionId === receiverid
      );
      target?.emit('reaction', { message: updatedMessage });
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
      const target = clientSockets.find(
        (socket) => socket.handshake.auth.sessionId === receiverid
      );
      target?.emit('focus', { roomid });
    });

    socket.on('disconnect', () => {
      removeClientSocket(socket);
    });
  });
}
