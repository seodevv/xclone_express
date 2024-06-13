import express from 'express';
import multer from 'multer';
import fs from 'fs-extra';
import { uploadPath } from '@/index';
import {
  httpBadRequestResponse,
  httpCreatedResponse,
  httpForbiddenResponse,
  httpInternalServerErrorResponse,
  httpNotFoundResponse,
  httpSuccessResponse,
  httpUnAuthorizedResponse,
} from '@/lib/responsesHandlers';
import { generateUserToken, decodingUserToken, storage } from '@/lib/common';
import DAO from '@/lib/DAO';
import {
  TypedRequestBody,
  TypedRequestCookies,
  TypedRequestParams,
  TypedRequestQueryParams,
} from '@/model/Request';
import { TypedResponse } from '@/model/Response';
import { AdvancedUser } from '@/model/User';
import { AdvancedPost } from '@/model/Post';
import { AdvancedRoom } from '@/model/Room';
import { Message } from '@/model/Message';

const apiUsersRouter = express.Router();
const upload = multer({ storage });

// "GET /api/users"
// 내 정보 조회
apiUsersRouter.get(
  '/',
  (
    req: TypedRequestCookies,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { ['connect.sid']: token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res, 'please login first');

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    return httpSuccessResponse(res, currentUser);
  }
);

// "POST /api/users"
// 회원 가입
apiUsersRouter.post(
  '/',
  upload.single('image'),
  (
    req: TypedRequestBody<{
      id?: string;
      password?: string;
      nickname?: string;
    }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { id, password, nickname } = req.body;
    const file = req.file;
    if (!id || !password || !nickname || !file) {
      file && fs.removeSync(uploadPath + '/' + file.filename);
      return httpBadRequestResponse(res);
    }

    const dao = new DAO();
    const findUser = dao.getUser(id);
    if (findUser) {
      fs.removeSync(uploadPath + '/' + file.filename);
      return httpForbiddenResponse(res, 'This ID already exists.');
    }

    const newUser = dao.createUser({
      id,
      password,
      nickname,
      image: file.filename,
    });

    const userToken = generateUserToken(newUser);
    if (!userToken) {
      return httpInternalServerErrorResponse(res);
    }
    res.cookie('connect.sid', userToken, {
      maxAge: 1000 * 60 * 60 * 24,
      httpOnly: true,
      path: '/',
    });

    return httpCreatedResponse(res, newUser);
  }
);

// "GET /api/users/followRecommends"
// 팔로우 추천인 조회
apiUsersRouter.get(
  '/followRecommends',
  (
    req: TypedRequestCookies,
    res: TypedResponse<{ data?: AdvancedUser[]; message: string }>
  ) => {
    const { ['connect.sid']: token } = req.cookies;

    const dao = new DAO();
    const recommendsList = dao.getUserList();
    recommendsList.sort((a, b) =>
      a._count.Followers > b._count.Followers ? -1 : 1
    );

    if (!token) {
      recommendsList.splice(3);
      return httpSuccessResponse(res, recommendsList);
    }

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      recommendsList.splice(3);
      return httpSuccessResponse(res, recommendsList);
    }

    const currentUserIndex = recommendsList.findIndex(
      (u) => u.id === currentUser.id
    );
    recommendsList.splice(currentUserIndex, 1);
    currentUser.Followers.forEach((f) => {
      const index = recommendsList.findIndex((u) => u.id === f.id);
      if (index >= 0) {
        recommendsList.splice(index, 1);
      }
    });
    recommendsList.splice(3);

    return httpSuccessResponse(res, recommendsList);
  }
);

// "GET /api/users/:id"
// 특정 유저 정보 조회
apiUsersRouter.get(
  '/:id',
  (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { id } = req.params;
    if (!id) return httpBadRequestResponse(res);

    const dao = new DAO();
    const findUser = dao.getUser(id);
    if (!findUser) {
      return httpNotFoundResponse(res, 'User not found');
    }

    return httpSuccessResponse(res, findUser);
  }
);

// "GET /api/users/:id/posts"
// 특정 유저의 게시물 조회
apiUsersRouter.get(
  '/:id/posts',
  (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ data?: AdvancedPost[]; message: string }>
  ) => {
    const { id } = req.params;
    if (!id) return httpBadRequestResponse(res);

    const dao = new DAO();
    const findUser = dao.getUser(id);
    if (!findUser) {
      return httpNotFoundResponse(res, 'User not found');
    }

    const userPostList = dao.getPostList({ userId: findUser.id });
    userPostList.sort((a, b) => (a.createAt > b.createAt ? -1 : 1));

    return httpSuccessResponse(res, userPostList);
  }
);

// "POST /api/users/:id/follow"
// 특정 유저 팔로우
apiUsersRouter.post(
  '/:id/follow',
  (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { id } = req.params;
    const { ['connect.sid']: token } = req.cookies;
    if (!id) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res, 'please login first');

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const targetUser = dao.getUser(id);
    if (!targetUser) {
      return httpNotFoundResponse(res, 'User not found');
    }

    if (currentUser.id === targetUser.id) {
      return httpForbiddenResponse(res, 'You cannot follow yourself.');
    }

    const isFollow = !!targetUser.Followers.find(
      (u) => u.id === currentUser.id
    );
    if (isFollow) {
      return httpForbiddenResponse(res, 'You are already following this user.');
    }

    const followedUser = dao.followHandler({
      type: 'follow',
      source: currentUser.id,
      target: targetUser.id,
    });

    return httpSuccessResponse(res, followedUser);
  }
);

// "DELETE /api/users/:id/follow"
// 특정 유저 언팔로우
apiUsersRouter.delete(
  '/:id/follow',
  (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { id } = req.params;
    const { ['connect.sid']: token } = req.cookies;
    if (!id) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const targetUser = dao.getUser(id);
    if (!targetUser) {
      return httpNotFoundResponse(res, 'User not found');
    }

    if (currentUser.id === targetUser.id) {
      return httpForbiddenResponse(res, 'You cannot unfollow yourself.');
    }

    const isFollow = !!targetUser.Followers?.find(
      (u) => u.id === currentUser.id
    );
    if (!isFollow) {
      return httpForbiddenResponse(
        res,
        'You are already unfollowing this user.'
      );
    }

    const unFollowedUser = dao.followHandler({
      type: 'unfollow',
      source: currentUser.id,
      target: targetUser.id,
    });

    return httpSuccessResponse(res, unFollowedUser);
  }
);

// "GET /api/users/:id/rooms"
// 특정 유저가 참여중인 채팅 리스트
apiUsersRouter.get(
  '/:id/rooms',
  (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ data?: AdvancedRoom[]; message: string }>
  ) => {
    const { id } = req.params;
    const { ['connect.sid']: token } = req.cookies;
    if (!id) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    if (id !== currentUser.id) return httpForbiddenResponse(res);

    const dao = new DAO();
    const roomList = dao.getRoomList(currentUser.id);
    return httpSuccessResponse(res, roomList);
  }
);

// "GET /api/users/:id/rooms/:roomId"
// 특정 유저가 참여중인 채팅방의 메시지 조회
// roomId : 상대방 아이디
apiUsersRouter.get(
  '/:id/rooms/:roomId',
  (
    req: TypedRequestQueryParams<
      { cursor?: string },
      { id?: string; roomId?: string }
    >,
    res: TypedResponse<{ data?: Message[]; message: string }>
  ) => {
    const { id, roomId } = req.params;
    const { cursor } = req.query;
    const { ['connect.sid']: token } = req.cookies;
    if (!id || !roomId) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }
    if (id !== currentUser.id) return httpForbiddenResponse(res);

    const room = [id, roomId].sort().join('-');
    const dao = new DAO();
    const findRoom = dao
      .getRoomList(currentUser.id)
      .find((r) => r.room === room);
    if (!findRoom) {
      return httpNotFoundResponse(res, 'Room not found');
    }

    let messageList = dao.getMessageList(room);
    const regex = /^[0-9]+$/;
    if (cursor && regex.test(cursor)) {
      messageList = messageList.filter((m) => m.messageId < parseInt(cursor));
    }
    messageList.splice(0, messageList.length - 10);

    return httpSuccessResponse(res, messageList);
  }
);

export default apiUsersRouter;
