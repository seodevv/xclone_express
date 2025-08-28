import { RoomsNotifications } from './../../model/Room';
import { TypedResponse } from './../../model/Response';
import {
  COOKIE_CLEAR_OPTIONS,
  decodingUserToken,
  decryptRoomId,
} from '@/lib/common';
import DAO from '@/lib/DAO';
import {
  httpBadRequestResponse,
  httpNotFoundResponse,
  httpSuccessResponse,
  httpUnAuthorizedResponse,
} from '@/lib/responsesHandlers';
import { TypedRequestCookies, TypedRequestParams } from '@/model/Request';
import { AdvancedRooms } from '@/model/Room';
import express from 'express';

const apiRoomsRouter = express.Router();

// GET /api/rooms
// 본인이 참여 중인 채팅 리스트
apiRoomsRouter.get(
  '/',
  async (
    req: TypedRequestCookies,
    res: TypedResponse<{ data?: AdvancedRooms[]; message: string }>
  ) => {
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const roomList = await dao.getRoomsList({
      sessionid: currentUser.id,
      findUserid: currentUser.id,
    });
    dao.release();
    return httpSuccessResponse(res, { data: roomList });
  }
);

// GET /api/rooms/notifications
// 전체 채팅방의 알람을 조회
apiRoomsRouter.get(
  '/notifications',
  async (
    req: TypedRequestCookies,
    res: TypedResponse<{ data?: RoomsNotifications[]; message: string }>
  ) => {
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const notifications = await dao.getRoomsNotification({
      sessionid: currentUser.id,
    });
    dao.release();

    return httpSuccessResponse(res, { data: notifications, message: 'ok' });
  }
);

// GET /api/rooms/:roomid
// 특정 채팅방 정보를 조회
apiRoomsRouter.get(
  '/:roomid',
  async (
    req: TypedRequestParams<{ roomid?: string }>,
    res: TypedResponse<{
      data?: AdvancedRooms;
      message: string;
    }>
  ) => {
    const { roomid } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!roomid) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);
    if (!roomid.includes('-')) return httpBadRequestResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token is expired');
    }

    const dao = new DAO();
    const findRoom = await dao.getAdvancedRoom({
      sessionid: currentUser.id,
      roomid,
      findUserid: currentUser.id,
    });
    if (!findRoom) {
      const receiverid = decryptRoomId({
        userid: currentUser.id,
        roomid,
      });
      const receiver = await dao.getUser({ id: receiverid });
      dao.release();
      if (typeof receiver === 'undefined') {
        return httpNotFoundResponse(res, 'The roomid is invalid');
      }
      const instantRoom: AdvancedRooms = {
        id: roomid,
        receiverid,
        Receiver: {
          id: receiver.id,
          nickname: receiver.nickname,
          image: receiver.image,
          verified: receiver.verified,
        },
        senderid: currentUser.id,
        Sender: {
          id: currentUser.id,
          nickname: currentUser.nickname,
          image: currentUser.image,
          verified: currentUser.verified,
        },
        createat: new Date(),
        lastmessageid: null,
        lastmessagesenderid: null,
        type: null,
        content: null,
        lastat: null,
        sent: [
          { id: currentUser.id, count: 0 },
          { id: receiver.id, count: 0 },
        ],
        Disabled: [],
      };
      return httpSuccessResponse(res, { data: instantRoom, message: 'ok' });
    }

    dao.release();
    return httpSuccessResponse(res, { data: findRoom, message: 'ok' });
  }
);

// DELETE /api/rooms/:roomid
// 특정 채팅방을 비활성화
apiRoomsRouter.delete(
  '/:roomid',
  async (req: TypedRequestParams<{ roomid?: string }>, res) => {
    const { roomid } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!roomid) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token is expired');
    }

    const dao = new DAO();
    const findRoom = await dao.getRoom({
      roomid,
      findUserid: currentUser.id,
    });
    if (!findRoom) {
      dao.release();
      return httpNotFoundResponse(res, 'The room not found');
    }

    await dao.roomsDetailHandler({
      method: 'delete',
      type: 'disable',
      roomid,
      userid: currentUser.id,
    });

    return httpSuccessResponse(res, { message: 'ok' });
  }
);

// POST /api/rooms/:roomid/seen
// 특정 채팅방의 상대방의 메시지를 읽음
apiRoomsRouter.post(
  '/:roomid/seen',
  async (
    req: TypedRequestParams<{ roomid?: string }>,
    res: TypedResponse<{ data?: AdvancedRooms; message: string }>
  ) => {
    const { roomid } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!roomid) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token the expired');
    }

    const dao = new DAO();
    const findRoom = await dao.getRoom({
      roomid,
      findUserid: currentUser.id,
    });
    if (!findRoom) {
      dao.release();
      return httpNotFoundResponse(res, 'Room not found');
    }

    const updatedMessage = await dao.updateSeen({
      roomid,
      sessionid: currentUser.id,
    });
    dao.release();

    return httpSuccessResponse(res, { data: updatedMessage, message: 'ok' });
  }
);

// POST /api/rooms/:roomid/pin
// 특정 채팅방에 핀을 추가
apiRoomsRouter.post(
  '/:roomid/pin',
  async (req: TypedRequestParams<{ roomid: string }>, res) => {
    const { roomid } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token is expired');
    }

    
  }
);

export default apiRoomsRouter;
