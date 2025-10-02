import { Schemas } from './../../db/schema';
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
    req: TypedRequestQuery<{ cursor?: string; size?: string; q?: string }>,
    res: TypedResponse<{
      data?: (AdvancedMessages & { Room: AdvancedRooms })[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    await delay(1500);
    const { cursor = '0', size = '10', q = '' } = req.query;
    const { 'connect.sid': token } = req.cookies;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const messagesList = await dao.getMessagesListSearch({
      sessionid: currentUser.id,
      q: decodeURIComponent(q),
      pagination: {
        limit: pageSize,
        offset: ~~cursor,
      },
    });
    dao.release();

    if (typeof messagesList === 'undefined') {
      return httpInternalServerErrorResponse(res);
    }

    return httpSuccessResponse(res, {
      data: messagesList,
      nextCursor: messagesList.length === pageSize ? ~~cursor + 1 : undefined,
      message: 'ok',
    });
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
      { roomid: string }
    >,
    res: TypedResponse<{
      data?: AdvancedMessages[];
      prevCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor = '0', size = '50' } = req.query;
    const { roomid } = req.params;
    const { 'connect.sid': token } = req.cookies;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findRoom = await dao.getRoom({
      roomid,
      findUserid: currentUser.id,
    });
    if (typeof findRoom === 'undefined') {
      dao.release();
      return httpSuccessResponse(res, { data: [] });
    }

    const messageList = await dao.getMessagesList({
      roomid,
      pagination: {
        limit: pageSize,
        offset: ~~cursor,
      },
    });
    dao.release();

    if (typeof messageList === 'undefined') {
      return httpInternalServerErrorResponse(res);
    }

    return httpSuccessResponse(res, {
      data: messageList,
      prevCursor: messageList.length === pageSize ? ~~cursor + 1 : undefined,
    });
  }
);

// DELETE /api/messages/:roomid
// 본인이 참여 중인 채팅 방의 메시지를 비활성화
apiMessagesRouter.delete(
  '/:roomid',
  async (
    req: TypedRequestBodyParams<{ messageid?: string }, { roomid: string }>,
    res: TypedResponse<{}>
  ) => {
    const roomid = req.params.roomid;
    const messageid = req.body.messageid;
    const { 'connect.sid': token } = req.cookies;
    if (!messageid || !REGEX_NUMBER_ONLY.test(messageid)) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
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
      { roomid: string }
    >,
    res: TypedResponse<{ message: string }>
  ) => {
    const roomid = req.params.roomid;
    const { messageid, content } = req.body;
    const { 'connect.sid': token } = req.cookies;
    if (!messageid || !content) return httpBadRequestResponse(res);
    if (!REGEX_NUMBER_ONLY.test(messageid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
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

    const findMessageDetail = await dao.getMessagesdetail({
      type: 'react',
      messageid: ~~messageid,
      userid: currentUser.id,
    });

    if (findMessageDetail?.content === content) {
      dao.release();
      return httpForbiddenResponse(res, 'Already have the same content');
    }

    const result = await dao.messagesDetailHandler({
      type:
        typeof findMessageDetail === 'undefined' ? 'addReact' : 'updateReact',
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
    req: TypedRequestBodyParams<{ messageid?: string }, { roomid: string }>,
    res: TypedResponse<{ message: string }>
  ) => {
    const roomid = req.params.roomid;
    const messageid = req.body.messageid;
    const { 'connect.sid': token } = req.cookies;
    if (!messageid) return httpBadRequestResponse(res);
    if (!REGEX_NUMBER_ONLY.test(messageid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
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

    const result = await dao.messagesDetailHandler({
      type: 'removeReact',
      payload: {
        userid: currentUser.id,
        messageid: ~~messageid,
      },
    });
    dao.release();
    if (!result) return httpInternalServerErrorResponse(res);

    return httpNoContentRepsonse(res);
  }
);

export default apiMessagesRouter;
