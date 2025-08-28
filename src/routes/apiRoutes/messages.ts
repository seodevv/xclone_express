import { COOKIE_CLEAR_OPTIONS, decodingUserToken, delay } from '@/lib/common';
import DAO from '@/lib/DAO';
import { REGEX_NUMBER_ONLY } from '@/lib/regex';
import {
  httpBadRequestResponse,
  httpCreatedResponse,
  httpForbiddenResponse,
  httpInternalServerErrorResponse,
  httpNoContentRepsonse,
  httpNotFoundResponse,
  httpSuccessResponse,
  httpUnAuthorizedResponse,
} from '@/lib/responsesHandlers';
import { AdvancedMessages } from '@/model/Message';
import {
  TypedRequestBodyParams,
  TypedRequestQuery,
  TypedRequestQueryParams,
} from '@/model/Request';
import { TypedResponse } from '@/model/Response';
import { AdvancedRooms } from '@/model/Room';
import express from 'express';

const apiMessagesRouter = express.Router();

// GET /api/messages/search
// 본인이 참여 중인 채팅 방의 메시지의 내용을 검색
apiMessagesRouter.get(
  '/search',
  async (
    req: TypedRequestQuery<{ cursor?: string; size?: string; query?: string }>,
    res: TypedResponse<{
      data?: (AdvancedMessages & { Room: AdvancedRooms })[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    await delay(1500);
    const { cursor, size = '10', query = '' } = req.query;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const pageSize = ~~size !== 0 ? ~~size : 10;
    const messagesList = await dao.getMessagesListSearch({
      sessionid: currentUser.id,
      query: decodeURIComponent(query),
      cursor:
        typeof cursor !== 'undefined'
          ? ~~cursor !== 0
            ? ~~cursor
            : undefined
          : undefined,
      limit: ~~pageSize,
    });
    dao.release();

    if (typeof messagesList === 'undefined') {
      return httpInternalServerErrorResponse(res);
    }

    return httpSuccessResponse(res, { data: messagesList, message: 'ok' });
  }
);

// GET /api/messages/:roomid
// 본인이 참여 중인 채팅 방의 메시지를 조회
apiMessagesRouter.get(
  '/:roomid',
  async (
    req: TypedRequestQueryParams<
      {
        cursor?: string;
        size?: string;
      },
      { roomid?: string }
    >,
    res: TypedResponse<{
      data?: AdvancedMessages[];
      prevCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor, size = '50' } = req.query;
    const { roomid } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!roomid) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findRoom = await dao.getRoom({
      roomid,
      findUserid: currentUser.id,
    });
    if (!findRoom) {
      dao.release();
      return httpSuccessResponse(res, { data: [] });
    }

    const pageSize = ~~size !== 0 ? ~~size : 10;
    const messageList = await dao.getMessagesList({
      roomid,
      cursor:
        typeof cursor !== 'undefined'
          ? ~~cursor !== 0
            ? ~~cursor
            : undefined
          : undefined,
      limit: ~~pageSize,
    });
    dao.release();

    if (typeof messageList === 'undefined') {
      return httpInternalServerErrorResponse(res);
    }

    return httpSuccessResponse(res, {
      data: messageList,
      prevCursor:
        messageList.length === pageSize ? messageList.at(0)?.id : undefined,
    });
  }
);

// DELETE /api/messages/:roomid
// 본인이 참여 중인 채팅 방의 메시지를 비활성화
apiMessagesRouter.delete(
  '/:roomid',
  async (
    req: TypedRequestBodyParams<{ messageid?: string }, { roomid?: string }>,
    res
  ) => {
    const { messageid } = req.body;
    const { roomid } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!messageid || !REGEX_NUMBER_ONLY.test(messageid) || !roomid) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
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

    const result = await dao.messagesDetailHandler({
      type: 'disable',
      payload: {
        messageid: ~~messageid,
        userid: currentUser.id,
      },
    });
    dao.release();
    if (!result) return httpInternalServerErrorResponse(res);

    return httpNoContentRepsonse(res);
  }
);

// POST /api/messages/:roomid/react
// 메시지에 대한 리액션을 추가/업데이트
apiMessagesRouter.post(
  '/:roomid/react',
  async (
    req: TypedRequestBodyParams<
      { messageid?: string; content?: string },
      { roomid?: string }
    >,
    res: TypedResponse<{ message: string }>
  ) => {
    const { roomid } = req.params;
    const { messageid, content } = req.body;
    const { 'connect.sid': token } = req.cookies;
    if (!roomid || !messageid || !content) return httpBadRequestResponse(res);
    if (!REGEX_NUMBER_ONLY.test(messageid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
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

    const find = await dao.getMessagesdetail({
      type: 'react',
      messageid: ~~messageid,
      userid: currentUser.id,
    });

    if (find?.content === content) {
      return httpForbiddenResponse(res, 'Already have the same content');
    }

    const result = await dao.messagesDetailHandler({
      type: typeof find === 'undefined' ? 'addReact' : 'updateReact',
      payload: {
        userid: currentUser.id,
        messageid: ~~messageid,
        content,
      },
    });
    dao.release();
    if (!result) return httpInternalServerErrorResponse(res);

    return httpCreatedResponse(res, { message: 'ok' });
  }
);

// DELETE /api/messages/:roomid/react
// 메시지에 대한 리액션을 삭제
apiMessagesRouter.delete(
  '/:roomid/react',
  async (
    req: TypedRequestBodyParams<{ messageid?: string }, { roomid?: string }>,
    res: TypedResponse<{ message: string }>
  ) => {
    const { roomid } = req.params;
    const { messageid } = req.body;
    const { 'connect.sid': token } = req.cookies;
    if (!roomid || !messageid) return httpBadRequestResponse(res);
    if (!REGEX_NUMBER_ONLY.test(messageid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
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

    const result = await dao.messagesDetailHandler({
      type: 'removeReact',
      payload: {
        userid: currentUser.id,
        messageid: ~~messageid,
      },
    });
    dao.release();
    if (!result) return httpInternalServerErrorResponse(res);

    return httpCreatedResponse(res, { message: 'ok' });
  }
);

export default apiMessagesRouter;
