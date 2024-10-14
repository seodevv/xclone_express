import { AdvancedPost } from '@/model/Post';
import express from 'express';
import multer from 'multer';
import fs from 'fs-extra';
import path from 'path';
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
  removingFiles,
} from '@/lib/common';
import {
  TypedRequestBody,
  TypedRequestCookies,
  TypedRequestParams,
  TypedRequestQuery,
  TypedRequestQueryParams,
} from '@/model/Request';
import { TypedResponse } from '@/model/Response';
import { AdvancedUser } from '@/model/User';
import { Message } from '@/model/Message';
import { REGEX_NUMBER_ONLY } from '@/lib/regex';
import { AdvancedLists } from '@/model/Lists';
import DAO from '@/lib/DAO';
import { Birth } from '@/db/schema';
import { AdvancedRooms } from '@/model/Room';

const apiUsersRouter = express.Router();
const upload = multer({ storage });

// "GET /api/users"
// 내 정보 조회
apiUsersRouter.get(
  '/',
  async (
    req: TypedRequestCookies,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res, 'please login first');

    const currentUser = await decodingUserToken(token);
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
    const findUser = await dao.getUser({ id });
    if (findUser) {
      dao.release();
      fs.removeSync(uploadPath + '/' + file.filename);
      return httpForbiddenResponse(res, 'This ID already exists.');
    }

    const newUser = await dao.createUser({
      id,
      password,
      nickname,
      birth: birth
        ? {
            date: birth,
            scope: {
              month: 'each',
              year: 'only',
            },
          }
        : null,
      image: file.filename,
    });
    dao.release();

    if (!newUser) {
      fs.removeSync(uploadPath + '/' + file.filename);
      return httpInternalServerErrorResponse(res);
    }

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
  async (
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
    await delay(1000);
    const { cursor, q, pf, lf, f } = req.query;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    let searchUserList = await dao.getUserList({ q });
    if (!searchUserList) {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }

    if (cursor) {
      dao.release();
      const findIndex = searchUserList.findIndex((u) => u.id === cursor);
      searchUserList.splice(0, findIndex + 1);
    }

    if (pf) {
      const followList = (
        await dao.getFollowList({ target: currentUser.id })
      )?.map((u) => u.source);
      const followingList = (
        await dao.getFollowList({ source: currentUser.id })
      )?.map((u) => u.target);

      if (!followList || !followingList) {
        dao.release();
        return httpInternalServerErrorResponse(res);
      }

      searchUserList = searchUserList.filter(
        (u) => followList.includes(u.id) || followingList.includes(u.id)
      );
    }
    dao.release();

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
  async (
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
    const recommendsList = await dao.getUserList({});
    if (!recommendsList) {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }
    recommendsList.sort((a, b) =>
      a._count.Followers > b._count.Followers ? -1 : 1
    );

    if (!token) {
      dao.release();
      recommendsList.splice(pageSize);
      return httpSuccessResponse(res, { data: recommendsList });
    }

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      dao.release();
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      res.clearCookie('connect.sid');
      recommendsList.splice(pageSize);
      return httpSuccessResponse(res, { data: recommendsList });
    }

    const currentUserIndex = recommendsList.findIndex(
      (u) => u.id === currentUser.id
    );
    if (currentUserIndex > -1) {
      recommendsList.splice(currentUserIndex, 1);
    }

    const followist = await dao.getFollowList({ source: currentUser.id });
    dao.release();
    if (followist) {
      followist.forEach((f) => {
        const index = recommendsList.findIndex((u) => u.id === f.target);
        if (index > -1) {
          recommendsList.splice(index, 1);
        }
      });
    }

    if (cursor) {
      const index = recommendsList.findIndex((r) => r.id === cursor);
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

// "POST /api/users/edit"
// 프로필 수정
apiUsersRouter.post(
  '/edit',
  upload.fields([
    { name: 'banner', maxCount: 1 },
    { name: 'image', maxCount: 1 },
  ]),
  async (
    req: TypedRequestBody<{
      nickname?: string;
      desc?: string;
      location?: string;
      refer?: string;
      birth?: string;
      updated?: string;
    }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { nickname, desc, location, refer } = req.body;
    const birth = req.body.birth
      ? (JSON.parse(req.body.birth) as Birth)
      : undefined;
    const updated = req.body.updated
      ? (JSON.parse(req.body.updated) as {
          nickname: boolean;
          desc: boolean;
          location: boolean;
          refer: boolean;
          birth: boolean;
          image: boolean;
          banner: boolean;
        })
      : undefined;
    const files = req.files;
    const { 'connect.sid': token } = req.cookies;
    if (!updated || !files || Array.isArray(files)) {
      removingFiles(files);
      return httpBadRequestResponse(res);
    }
    if (!token) {
      removingFiles(files);
      return httpUnAuthorizedResponse(res);
    }

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      removingFiles(files);
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    if (Object.values(updated).every((v) => !v)) {
      removingFiles(files);
      return httpForbiddenResponse(res);
    }

    const imageFiles = files.image;
    const bannerFiles = files.banner;
    const image = imageFiles ? imageFiles[0].filename : undefined;
    const banner = bannerFiles ? bannerFiles[0].filename : undefined;

    const dao = new DAO();
    const updatedUser = await dao.updateUser({
      id: currentUser.id,
      nickname: updated.nickname ? nickname : undefined,
      desc: updated.desc ? desc : undefined,
      location: updated.location ? location : undefined,
      birth: updated.birth ? birth : undefined,
      refer: updated.refer ? refer : undefined,
      image: updated.image ? image : undefined,
      banner: updated.banner
        ? typeof banner === 'undefined'
          ? ''
          : banner
        : undefined,
    });
    dao.release();

    if (updated.image && currentUser.image) {
      const imagePath = path.join(uploadPath, '/', currentUser.image);
      fs.removeSync(imagePath);
    }

    if (updated.banner && currentUser.banner) {
      const imagePath = path.join(uploadPath, '/', currentUser.banner);
      fs.removeSync(imagePath);
    }

    return httpSuccessResponse(res, { data: updatedUser });
  }
);

// "DELETE /api/users/birth"
// 유저 생일 삭제
apiUsersRouter.delete(
  '/birth',
  async (
    req: TypedRequestCookies,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    if (!currentUser.birth) {
      return httpForbiddenResponse(
        res,
        'The user does not have a set birthday'
      );
    }

    const dao = new DAO();
    const updatedUser = await dao.deleteBirth({
      id: currentUser.id,
    });
    dao.release();

    return httpSuccessResponse(res, { data: updatedUser });
  }
);

// "GET /api/users/:id"
// 특정 유저 정보 조회
apiUsersRouter.get(
  '/:id',
  async (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { id } = req.params;
    if (!id) return httpBadRequestResponse(res);

    const dao = new DAO();
    const findUser = await dao.getUser({ id });
    dao.release();
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
      { cursor?: string; filter?: 'all' | 'reply' | 'media' },
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
    const findUser = await dao.getUser({ id });
    if (!findUser) {
      dao.release();
      return httpNotFoundResponse(res, 'User not found');
    }

    let userPostList = await dao.getPostList({ userid: findUser.id });
    dao.release();
    if (!userPostList) {
      return httpInternalServerErrorResponse(res);
    }
    userPostList.sort((a, b) => {
      return a.createat > b.createat ? -1 : 1;
    });
    if (filter === 'all') {
      userPostList.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (b.pinned && !a.pinned) return 1;
        return a.createat > b.createat ? -1 : 1;
      });
    }

    if (filter === 'reply') {
      userPostList = userPostList.filter((p) => !!p.parentid);
    } else if (filter === 'media') {
      userPostList = userPostList.filter(
        (u) => !u.parentid && !u.originalid && u.images.length
      );
    }

    const regex = /^[0-9]+$/;
    if (cursor && regex.test(cursor)) {
      const index = userPostList.findIndex(
        (p) => p.postid === parseInt(cursor)
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
        prevLength > pageSize ? userPostList.at(-1)?.postid : undefined,
    });
  }
);

// "GET /api/users/:id/lists"
// 특정 유저의 리스트 조회
apiUsersRouter.get(
  '/:id/lists',
  async (
    req: TypedRequestQueryParams<
      { cursor?: string; size?: string; filter?: string },
      { id: string }
    >,
    res: TypedResponse<{
      data?: AdvancedLists[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor, size = '10', filter = 'all' } = req.query;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (filter !== 'all' && filter !== 'own' && filter !== 'memberships') {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findUser = await dao.getUser({ id });
    if (!findUser) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    let listsList = await dao.getListsList({
      sessionid: currentUser.id,
      userid: findUser.id,
      make: currentUser.id !== findUser.id ? 'public' : undefined,
      filter,
    });
    dao.release();
    if (!listsList) return httpInternalServerErrorResponse(res);

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
  async (
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
    const findUser = await dao.getUser({ id });
    if (!findUser) {
      dao.release();
      return httpNotFoundResponse(res, 'User not found');
    }

    if (filter === 'likes') {
      const heartList = await dao.getLikeList({ userid: findUser.id });
      dao.release();
      return httpSuccessResponse(res, { data: heartList?.length || 0 });
    }

    const userPostList = await dao.getPostList({ userid: findUser.id });
    dao.release();
    if (!userPostList) return httpInternalServerErrorResponse(res);

    let count = userPostList.length;
    if (filter === 'media') {
      count = userPostList.filter(
        (p) => !p.parentid && !p.originalid && p.images.length !== 0
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
    const findUser = await dao.getUser({ id });
    if (!findUser) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    const followList = (
      await dao.getFollowList(
        ['follow', 'verified_followers'].includes(type)
          ? { target: findUser.id }
          : { source: findUser.id }
      )
    )?.map((f) =>
      ['follow', 'verified_followers'].includes(type) ? f.source : f.target
    );
    if (!followList) {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }
    let userList = (await dao.getUserList({}))?.filter((u) =>
      followList.includes(u.id)
    );
    dao.release();
    if (!userList) {
      return httpInternalServerErrorResponse(res);
    }

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
  async (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { id } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!id) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res, 'please login first');

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const targetUser = await dao.getUser({ id });
    if (!targetUser) {
      dao.release();
      return httpNotFoundResponse(res, 'User not found');
    }

    if (currentUser.id === targetUser.id) {
      dao.release();
      return httpForbiddenResponse(res, 'You cannot follow yourself.');
    }

    const isFollow = !!targetUser.Followers.find(
      (u) => u.id === currentUser.id
    );
    if (isFollow) {
      dao.release();
      return httpForbiddenResponse(res, 'You are already following this user.');
    }

    const followedUser = await dao.followHandler({
      type: 'follow',
      source: currentUser.id,
      target: targetUser.id,
    });
    dao.release();

    return httpSuccessResponse(res, { data: followedUser });
  }
);

// "DELETE /api/users/:id/follow"
// 특정 유저 언팔로우
apiUsersRouter.delete(
  '/:id/follow',
  async (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { id } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!id) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const targetUser = await dao.getUser({ id });
    if (!targetUser) {
      dao.release();
      return httpNotFoundResponse(res, 'User not found');
    }

    if (currentUser.id === targetUser.id) {
      dao.release();
      return httpForbiddenResponse(res, 'You cannot unfollow yourself.');
    }

    const isFollow = !!targetUser.Followers?.find(
      (u) => u.id === currentUser.id
    );
    if (!isFollow) {
      dao.release();
      return httpForbiddenResponse(
        res,
        'You are already unfollowing this user.'
      );
    }

    const unFollowedUser = await dao.followHandler({
      type: 'unfollow',
      source: currentUser.id,
      target: targetUser.id,
    });
    dao.release();

    return httpSuccessResponse(res, { data: unFollowedUser });
  }
);

// "GET /api/users/:id/rooms"
// 특정 유저가 참여중인 채팅 리스트
apiUsersRouter.get(
  '/:id/rooms',
  async (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ data?: AdvancedRooms[]; message: string }>
  ) => {
    const { id } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!id) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    if (id !== currentUser.id) return httpForbiddenResponse(res);

    const dao = new DAO();
    const roomList = await dao.getRoomsList({ userid: currentUser.id });
    dao.release();
    return httpSuccessResponse(res, { data: roomList });
  }
);

// "GET /api/users/:id/rooms/:target"
// 특정 유저가 참여중인 채팅방의 메시지 조회
// target : 상대방 아이디
apiUsersRouter.get(
  '/:id/rooms/:target',
  async (
    req: TypedRequestQueryParams<
      { cursor?: string; size?: string },
      { id?: string; target?: string }
    >,
    res: TypedResponse<{
      data?: Message[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { id, target } = req.params;
    const { cursor, size = '10' } = req.query;
    const { 'connect.sid': token } = req.cookies;
    if (!id || !target) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }
    if (id !== currentUser.id) return httpForbiddenResponse(res);

    const roomid = [id, target].sort().join('-');
    const dao = new DAO();
    const findRoom = await dao.getRoomsList({ userid: currentUser.id, roomid });
    if (!findRoom) {
      dao.release();
      return httpNotFoundResponse(res, 'Room not found');
    }

    let messageList = await dao.getMessagesList({ roomid });
    dao.release();
    if (!messageList) return httpInternalServerErrorResponse(res);

    const regex = /^[0-9]+$/;
    if (cursor && regex.test(cursor)) {
      const findIndex = messageList.findIndex((m) => m.id === ~~cursor);
      if (findIndex > -1) {
        messageList.splice(findIndex);
      }
    }

    const pageSize = regex.test(size) ? (~~size !== 0 ? ~~size : 10) : 10;
    const isOver = messageList.length > pageSize;
    if (isOver) {
      messageList.splice(0, messageList.length - 10);
    }

    messageList.reverse();

    return httpSuccessResponse(res, {
      data: messageList,
      nextCursor: isOver ? messageList.at(-1)?.id : undefined,
    });
  }
);

export default apiUsersRouter;
