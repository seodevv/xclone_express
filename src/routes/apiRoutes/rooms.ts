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
  httpForbiddenResponse,
  httpInternalServerErrorResponse,
  httpNotFoundResponse,
  httpSuccessResponse,
  httpUnAuthorizedResponse,
} from '@/lib/responsesHandlers';
import {
  TypedRequestBodyParams,
  TypedRequestCookies,
  TypedRequestParams,
} from '@/model/Request';
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
    if (typeof currentUser === 'undefined') {
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
    console.log('cookies', req.cookies);
    console.log('token', token);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    console.log('currentUser', currentUser);
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
    req: TypedRequestParams<{ roomid: string }>,
    res: TypedResponse<{
      data?: AdvancedRooms;
      message: string;
    }>
  ) => {
    const { roomid } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);
    if (!roomid.includes('-')) return httpBadRequestResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token is expired');
    }

    const dao = new DAO();
    const findRoom = await dao.getAdvancedRoom({
      sessionid: currentUser.id,
      roomid,
      findUserid: currentUser.id,
    });
    if (typeof findRoom === 'undefined') {
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
        Pinned: false,
        Disabled: false,
        Snooze: null,
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
  async (
    req: TypedRequestParams<{ roomid: string }>,
    res: TypedResponse<{ data?: AdvancedRooms; message: string }>
  ) => {
    const { roomid } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token is expired');
    }

    const dao = new DAO();
    const findRoom = await dao.getRoom({
      roomid,
      findUserid: currentUser.id,
    });
    if (typeof findRoom === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res, 'The room not found');
    }

    const result = await dao.roomsDetailHandler({
      method: 'post',
      type: 'disable',
      roomid,
      userid: currentUser.id,
    });
    if (typeof result === 'undefined') {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }

    const updatedRoom = await dao.getAdvancedRoom({
      sessionid: currentUser.id,
      roomid: findRoom.id,
    });
    dao.release();

    return httpSuccessResponse(res, { data: updatedRoom, message: 'ok' });
  }
);

// POST /api/rooms/:roomid/seen
// 특정 채팅방의 상대방의 메시지를 읽음
apiRoomsRouter.post(
  '/:roomid/seen',
  async (
    req: TypedRequestParams<{ roomid: string }>,
    res: TypedResponse<{ data?: AdvancedRooms; message: string }>
  ) => {
    const { roomid } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token the expired');
    }

    const dao = new DAO();
    const findRoom = await dao.getRoom({
      roomid,
      findUserid: currentUser.id,
    });
    if (typeof findRoom === 'undefined') {
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
  async (
    req: TypedRequestParams<{ roomid: string }>,
    res: TypedResponse<{ data?: AdvancedRooms; message: string }>
  ) => {
    const { roomid } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token is expired');
    }

    const dao = new DAO();
    const findRoom = await dao.getRoom({
      roomid,
      findUserid: currentUser.id,
    });
    if (typeof findRoom === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res, 'The room not found');
    }

    const result = await dao.roomsDetailHandler({
      method: 'post',
      type: 'pin',
      roomid: findRoom.id,
      userid: currentUser.id,
    });

    if (!result) {
      dao.release();
      return httpForbiddenResponse(res, 'This room is already pinned');
    }

    const updatedRoom = await dao.getAdvancedRoom({
      sessionid: currentUser.id,
      roomid: findRoom.id,
    });
    dao.release();

    return httpSuccessResponse(res, { data: updatedRoom, message: 'ok' });
  }
);

// DELETE /api/rooms/:roomid/pin
// 특정 채팅방에 핀을 제거
apiRoomsRouter.delete(
  '/:roomid/pin',
  async (
    req: TypedRequestParams<{ roomid: string }>,
    res: TypedResponse<{ data?: AdvancedRooms; message: string }>
  ) => {
    const { roomid } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token is expired');
    }

    const dao = new DAO();
    const findRoom = await dao.getRoom({
      roomid,
      findUserid: currentUser.id,
    });
    if (typeof findRoom === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res, 'The room not found');
    }

    const result = await dao.roomsDetailHandler({
      method: 'delete',
      type: 'pin',
      roomid: findRoom.id,
      userid: currentUser.id,
    });

    if (!result) {
      dao.release();
      return httpForbiddenResponse(res, 'This room is not pinned');
    }

    const updatedRoom = await dao.getAdvancedRoom({
      sessionid: currentUser.id,
      roomid: findRoom.id,
    });
    dao.release();

    return httpSuccessResponse(res, { data: updatedRoom, message: 'ok' });
  }
);

// POST /api/rooms/:roomid/snooze
// 특정 채팅방의 snooze를 설정
apiRoomsRouter.post(
  '/:roomid/snooze',
  async (
    req: TypedRequestBodyParams<{ snooze?: string }, { roomid: string }>,
    res: TypedResponse<{ data?: AdvancedRooms; message: string }>
  ) => {
    const { roomid } = req.params;
    const { snooze } = req.body;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);
    if (
      snooze !== '1h' &&
      snooze !== '8h' &&
      snooze !== '1w' &&
      snooze !== 'forever'
    ) {
      return httpBadRequestResponse(res);
    }

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token is expired');
    }

    const dao = new DAO();
    const findRoom = await dao.getRoom({ roomid, findUserid: currentUser.id });
    if (!findRoom) {
      dao.release();
      return httpNotFoundResponse(res, 'The room not found');
    }

    const result = await dao.roomsSnoozeHandler({
      method: 'post',
      type: snooze,
      userid: currentUser.id,
      roomid: findRoom.id,
    });

    if (typeof result === 'undefined') {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }

    const updatedRoom = await dao.getAdvancedRoom({
      sessionid: currentUser.id,
      roomid: findRoom.id,
    });
    dao.release();

    return httpSuccessResponse(res, { data: updatedRoom, message: 'ok' });
  }
);

// DELETE /api/rooms/:roomid/snooze
// 특정 채팅방의 snooze를 해제
apiRoomsRouter.delete(
  '/:roomid/snooze',
  async (
    req: TypedRequestParams<{ roomid: string }>,
    res: TypedResponse<{ data?: AdvancedRooms; message: string }>
  ) => {
    const { roomid } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentuser = await decodingUserToken(token);
    if (typeof currentuser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token is expired');
    }

    const dao = new DAO();
    const findRoom = await dao.getRoom({ roomid, findUserid: currentuser.id });
    if (typeof findRoom === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res, 'The room not found');
    }

    const result = await dao.roomsSnoozeHandler({
      method: 'delete',
      userid: currentuser.id,
      roomid,
    });
    if (typeof result === 'undefined') {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }
    if (!result) {
      dao.release();
      return httpForbiddenResponse(
        res,
        'This room is not already set to snooze'
      );
    }

    const updatedRoom = await dao.getAdvancedRoom({
      sessionid: currentuser.id,
      roomid,
    });
    dao.release();

    return httpSuccessResponse(res, { data: updatedRoom, message: 'ok' });
  }
);

export default apiRoomsRouter;
