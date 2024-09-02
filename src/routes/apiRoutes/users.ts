import express from 'express';
import multer from 'multer';
import fs from 'fs-extra';
import { uploadPath } from '@/app';
import {
  httpBadRequestResponse,
  httpCreatedResponse,
  httpForbiddenResponse,
  httpInternalServerErrorResponse,
  httpNotFoundResponse,
  httpSuccessResponse,
  httpUnAuthorizedResponse,
} from '@/lib/responsesHandlers';
import {
  generateUserToken,
  decodingUserToken,
  storage,
  delay,
  COOKIE_OPTIONS,
} from '@/lib/common';
import DAO from '@/lib/DAO';
import {
  TypedRequestBody,
  TypedRequestCookies,
  TypedRequestParams,
  TypedRequestQuery,
  TypedRequestQueryParams,
} from '@/model/Request';
import { TypedResponse } from '@/model/Response';
import { AdvancedUser } from '@/model/User';
import { AdvancedPost } from '@/model/Post';
import { AdvancedRoom } from '@/model/Room';
import { Message } from '@/model/Message';
import { REGEX_NUMBER_ONLY } from '@/lib/regex';
import { AdvancedLists } from '@/model/Lists';

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
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res, 'please login first');

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    return httpSuccessResponse(res, { data: currentUser });
  }
);

// "POST /api/users"
// 회원 가입
apiUsersRouter.post(
  '/',
  upload.single('image'),
  async (
    req: TypedRequestBody<{
      id?: string;
      nickname?: string;
      birth?: string;
      password?: string;
    }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    await delay(2000);
    const { id, nickname, birth, password } = req.body;
    const file = req.file;
    if (!id || !password || !nickname || !file) {
      file && fs.removeSync(uploadPath + '/' + file.filename);
      return httpBadRequestResponse(res);
    }

    const dao = new DAO();
    const findUser = dao.getUser({ id });
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
    res.cookie('connect.sid', userToken, COOKIE_OPTIONS);

    return httpCreatedResponse(res, { data: newUser });
  }
);

// "GET /api/users/search"
// 유저 검색
apiUsersRouter.get(
  '/search',
  (
    req: TypedRequestQuery<{
      cursor?: string;
      q?: string;
      pf?: 'on';
      lf?: 'on';
      f?: 'live' | 'user' | 'media' | 'lists';
    }>,
    res: TypedResponse<{
      data?: AdvancedUser[];
      nextCursor?: string;
      message: string;
    }>
  ) => {
    const { cursor, q, pf, lf, f } = req.query;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    let searchUserList = dao.getUserList();
    if (q) {
      const decode = decodeURIComponent(q);
      const regex = new RegExp(
        `${decode.toLowerCase().replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&')}`
      );
      searchUserList = searchUserList.filter(
        (u) => regex.test(u.id) || regex.test(u.nickname)
      );
    }

    if (cursor) {
      const findIndex = searchUserList.findIndex((u) => u.id === cursor);
      searchUserList.splice(0, findIndex + 1);
    }

    if (pf) {
      const followList = dao
        .getFollowList({ target: currentUser.id })
        .map((u) => u.source);
      const followingList = dao
        .getFollowList({ source: currentUser.id })
        .map((u) => u.target);

      searchUserList = searchUserList.filter(
        (u) => followList.includes(u.id) || followingList.includes(u.id)
      );
    }

    searchUserList.sort((a, b) =>
      a._count.Followers > b._count.Followers ? -1 : 1
    );
    searchUserList.splice(10);

    return httpSuccessResponse(res, {
      data: searchUserList,
      nextCursor:
        searchUserList.length === 10 ? searchUserList.at(-1)?.id : undefined,
    });
  }
);

// "GET /api/users/followRecommends"
// 팔로우 추천인 조회
apiUsersRouter.get(
  '/followRecommends',
  (
    req: TypedRequestQuery<{ cursor?: string; size?: string }>,
    res: TypedResponse<{
      data?: AdvancedUser[];
      nextCursor?: string;
      message: string;
    }>
  ) => {
    const cursor = req.query.cursor;
    const pageSize =
      req.query.size && ~~req.query.size !== 0 ? ~~req.query.size : 10;
    const { 'connect.sid': token } = req.cookies;

    const dao = new DAO();
    const recommendsList = dao.getUserList();
    recommendsList.sort((a, b) =>
      a._count.Followers > b._count.Followers ? -1 : 1
    );

    if (!token) {
      recommendsList.splice(pageSize);
      return httpSuccessResponse(res, { data: recommendsList });
    }

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      recommendsList.splice(pageSize);
      return httpSuccessResponse(res, { data: recommendsList });
    }

    const currentUserIndex = recommendsList.findIndex(
      (u) => u.id === currentUser.id
    );
    if (currentUserIndex > -1) {
      recommendsList.splice(currentUserIndex, 1);
    }

    const followist = dao.getFollowList({ source: currentUser.id });
    followist.forEach((f) => {
      const index = recommendsList.findIndex((u) => u.id === f.target);
      if (index > -1) {
        recommendsList.splice(index, 1);
      }
    });

    const regex = /^[0-9]+$/;
    if (cursor && regex.test(cursor)) {
      const index = recommendsList.findIndex((r) => (r.id = cursor));
      if (index > -1) {
        recommendsList.splice(0, index + 1);
      }
    }

    const prevLength = recommendsList.length;
    recommendsList.splice(pageSize);

    return httpSuccessResponse(res, {
      data: recommendsList,
      nextCursor: prevLength > pageSize ? recommendsList.at(-1)?.id : undefined,
    });
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
    const findUser = dao.getUser({ id });
    if (!findUser) {
      return httpNotFoundResponse(res, 'User not found');
    }

    return httpSuccessResponse(res, { data: findUser });
  }
);

// "GET /api/users/:id/posts"
// 특정 유저의 게시물 조회
apiUsersRouter.get(
  '/:id/posts',
  async (
    req: TypedRequestQueryParams<
      { cursor?: string; filter?: 'all' | 'reply' | 'media' | 'like' },
      { id?: string }
    >,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor, filter = 'all' } = req.query;
    const { id } = req.params;
    const pageSize = filter === 'media' ? 12 : 10;
    if (!id) return httpBadRequestResponse(res);

    const dao = new DAO();
    const findUser = dao.getUser({ id });
    if (!findUser) {
      return httpNotFoundResponse(res, 'User not found');
    }

    let userPostList = dao.getPostList({ userId: findUser.id });
    userPostList.sort((a, b) => {
      return a.createAt > b.createAt ? -1 : 1;
    });
    if (filter === 'all') {
      userPostList.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (b.pinned && !a.pinned) return 1;
        return a.createAt > b.createAt ? -1 : 1;
      });
    }

    if (filter === 'reply') {
      userPostList = userPostList.filter((p) => !!p.parentId);
    } else if (filter === 'media') {
      userPostList = userPostList.filter(
        (u) => !u.parentId && !u.originalId && u.images.length
      );
    }

    const regex = /^[0-9]+$/;
    if (cursor && regex.test(cursor)) {
      const index = userPostList.findIndex(
        (p) => p.postId === parseInt(cursor)
      );
      if (index > -1) {
        userPostList.splice(0, index + 1);
      }
    }
    const prevLength = userPostList.length;
    userPostList.splice(pageSize);

    return httpSuccessResponse(res, {
      data: userPostList,
      nextCursor:
        prevLength > pageSize ? userPostList.at(-1)?.postId : undefined,
    });
  }
);

// "GET /api/users/:id/lists"
// 특정 유저의 리스트 조회
apiUsersRouter.get(
  '/:id/lists',
  (
    req: TypedRequestQueryParams<
      { cursor?: string; size?: string },
      { id: string }
    >,
    res: TypedResponse<{
      data?: AdvancedLists[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor, size = '10' } = req.query;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findUser = dao.getUser({ id });
    if (!findUser) {
      return httpNotFoundResponse(res);
    }

    const make = currentUser.id !== findUser.id ? 'public' : undefined;
    const listsList = dao.getListsList({ userId: findUser.id, make });

    if (cursor && REGEX_NUMBER_ONLY.test(cursor)) {
      const findIndex = listsList.findIndex((l) => l.id === ~~cursor);
      if (findIndex > -1) {
        listsList.splice(0, findIndex + 1);
      }
    }

    const pageSize = REGEX_NUMBER_ONLY.test(size) && ~~size !== 0 ? ~~size : 10;
    const sizeOver = listsList.length > pageSize;
    if (sizeOver) {
      listsList.splice(pageSize);
    }

    return httpSuccessResponse(res, {
      data: listsList,
      nextCursor: sizeOver ? listsList.at(-1)?.id : undefined,
    });
  }
);

// "GET /api/users/:id/posts/count"
// 특정 유저의 전체 게시물 카운트 조회
apiUsersRouter.get(
  '/:id/posts/count',
  (
    req: TypedRequestQueryParams<
      { filter?: 'all' | 'media' | 'likes' },
      { id?: string }
    >,
    res: TypedResponse<{ data?: number; message: string }>
  ) => {
    const { filter = 'all' } = req.query;
    const { id } = req.params;
    if (!id) return httpBadRequestResponse(res);

    const dao = new DAO();
    const findUser = dao.getUser({ id });
    if (!findUser) {
      return httpNotFoundResponse(res, 'User not found');
    }

    if (filter === 'likes') {
      const heartList = dao.getLikeList({ userId: findUser.id });
      return httpSuccessResponse(res, { data: heartList.length });
    }

    const userPostList = dao.getPostList({ userId: findUser.id });
    let count = userPostList.length;
    if (filter === 'media') {
      count = userPostList.filter(
        (p) => !p.parentId && !p.originalId && p.images.length !== 0
      ).length;
    }

    return httpSuccessResponse(res, { data: count });
  }
);

// "GET /api/users/:id/follow"
// 특정 유저 팔로우 정보
apiUsersRouter.get(
  '/:id/follow',
  async (
    req: TypedRequestQuery<{
      cursor?: string;
      type?: 'verified_followers' | 'follow' | 'following';
      size?: string;
    }>,
    res: TypedResponse<{
      data?: AdvancedUser[];
      nextCursor?: string;
      message: string;
    }>
  ) => {
    const { cursor, type } = req.query;
    const pageSize =
      req.query.size && ~~req.query.size !== 0 ? ~~req.query.size : 10;
    const { id } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (
      !type ||
      !['verified_followers', 'follow', 'following'].includes(type)
    ) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const dao = new DAO();
    const findUser = dao.getUser({ id });
    if (!findUser) {
      return httpNotFoundResponse(res);
    }

    const followList = dao
      .getFollowList(
        ['follow', 'verified_followers'].includes(type)
          ? { target: findUser.id }
          : { source: findUser.id }
      )
      .map((f) =>
        ['follow', 'verified_followers'].includes(type) ? f.source : f.target
      );
    let userList = dao.getUserList().filter((u) => followList.includes(u.id));

    if (type === 'verified_followers') {
      userList = userList.filter((u) => u.verified);
    }

    if (cursor) {
      const index = userList.findIndex((u) => u.id === cursor);
      if (index > -1) {
        userList.splice(0, index + 1);
      }
    }

    const prevLength = userList.length;
    userList.splice(pageSize);
    return httpSuccessResponse(res, {
      data: userList,
      nextCursor: prevLength > pageSize ? userList.at(-1)?.id : undefined,
    });
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
    const { 'connect.sid': token } = req.cookies;
    if (!id) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res, 'please login first');

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const targetUser = dao.getUser({ id });
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

    return httpSuccessResponse(res, { data: followedUser });
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
    const { 'connect.sid': token } = req.cookies;
    if (!id) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const targetUser = dao.getUser({ id });
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

    return httpSuccessResponse(res, { data: unFollowedUser });
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
    const { 'connect.sid': token } = req.cookies;
    if (!id) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    if (id !== currentUser.id) return httpForbiddenResponse(res);

    const dao = new DAO();
    const roomList = dao.getRoomList(currentUser.id);
    return httpSuccessResponse(res, { data: roomList });
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
    const { 'connect.sid': token } = req.cookies;
    if (!id || !roomId) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
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

    return httpSuccessResponse(res, { data: messageList });
  }
);

export default apiUsersRouter;
