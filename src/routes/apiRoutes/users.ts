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
  COOKIE_CLEAR_OPTIONS,
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
import { AdvancedLists } from '@/model/Lists';
import DAO from '@/lib/DAO';
import { Birth } from '@/db/schema';

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
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
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
    if (typeof findUser !== 'undefined') {
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

    if (typeof newUser === 'undefined') {
      fs.removeSync(uploadPath + '/' + file.filename);
      return httpInternalServerErrorResponse(res);
    }

    const userToken = generateUserToken(newUser);
    if (typeof userToken === 'undefined') {
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
      size?: string;
      q?: string;
      pf?: 'on';
      lf?: 'on';
      f?: 'live' | 'user' | 'media' | 'lists';
      self?: string;
    }>,
    res: TypedResponse<{
      data?: AdvancedUser[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    await delay(1000);
    const { cursor = '0', size = '10', q, pf, lf, f, self } = req.query;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const pageSize = ~~size !== 0 ? ~~size : 10;
    let searchUserList = await dao.getUserList({
      q,
      sessionid: currentUser.id,
      sort: 'followers',
      pagination: {
        limit: pageSize,
        offset: ~~cursor,
      },
      relation: pf === 'on' ? 'Follow or Following' : undefined,
      self: typeof self !== 'undefined' ? true : undefined,
    });
    dao.release();

    if (typeof searchUserList === 'undefined') {
      return httpInternalServerErrorResponse(res);
    }

    return httpSuccessResponse(res, {
      data: searchUserList,
      nextCursor: searchUserList.length === pageSize ? ~~cursor + 1 : undefined,
    });
  }
);

// "GET /api/users/followRecommends"
// 팔로우 추천인 조회
apiUsersRouter.get(
  '/followRecommends',
  async (
    req: TypedRequestQuery<{ cursor?: string; size?: string; mode?: string }>,
    res: TypedResponse<{
      data?: AdvancedUser[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor = '0', size = '10', mode = 'all' } = req.query;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    const { 'connect.sid': token } = req.cookies;

    if (typeof token === 'undefined') {
      const dao = new DAO();
      const userList = await dao.getUserList({
        verified: mode === 'creator' ? true : undefined,
        sort: 'followers',
        pagination: {
          limit: pageSize,
          offset: ~~cursor,
        },
      });
      dao.release();

      if (typeof userList === 'undefined') {
        return httpInternalServerErrorResponse(res);
      }

      return httpSuccessResponse(res, {
        data: userList,
        nextCursor: userList.length === pageSize ? ~~cursor + 1 : undefined,
      });
    }

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const userList = await dao.getUserList({
      verified: mode === 'creator' ? true : undefined,
      sessionid: currentUser.id,
      sort: 'followers',
      pagination: {
        limit: pageSize,
        offset: ~~cursor,
      },
      relation: 'not Following',
    });
    dao.release();

    if (typeof userList === 'undefined') {
      return httpInternalServerErrorResponse(res);
    }

    return httpSuccessResponse(res, {
      data: userList,
      nextCursor: userList.length === 10 ? ~~cursor + 1 : undefined,
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
    if (typeof token === 'undefined') {
      removingFiles(files);
      return httpUnAuthorizedResponse(res);
    }

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      removingFiles(files);
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
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
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    if (currentUser.birth === null) {
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
    req: TypedRequestParams<{ id: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { id } = req.params;

    const dao = new DAO();
    const findUser = await dao.getUser({ id });
    dao.release();
    if (typeof findUser === 'undefined') {
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
      { cursor?: string; size?: string; filter?: string },
      { id: string }
    >,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor = '0', size = '10', filter = 'all' } = req.query;
    const { id } = req.params;
    const pageSize = ~~size !== 0 ? ~~size : filter === 'media' ? 12 : 10;
    if (filter !== 'all' && filter !== 'reply' && filter !== 'media') {
      return httpBadRequestResponse(res);
    }

    const dao = new DAO();
    const findUser = await dao.getUser({ id });
    if (typeof findUser === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res, 'User not found');
    }

    const postList = await dao.getPostList({
      userid: findUser.id,
      filter,
      sort: filter === 'all' ? 'pinned' : 'createat',
      pagination: {
        limit: pageSize,
        offset: ~~cursor,
      },
    });
    dao.release();
    if (typeof postList === 'undefined') {
      return httpInternalServerErrorResponse(res);
    }

    return httpSuccessResponse(res, {
      data: postList,
      nextCursor: postList.length === pageSize ? ~~cursor + 1 : undefined,
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
    const { cursor = '0', size = '10', filter = 'all' } = req.query;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    if (filter !== 'all' && filter !== 'own' && filter !== 'memberships') {
      return httpBadRequestResponse(res);
    }
    if (typeof token === 'undefined') return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findUser = await dao.getUser({ id });
    if (typeof findUser === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res);
    }

    const listsList = await dao.getListsList({
      sessionid: currentUser.id,
      userid: findUser.id,
      make: currentUser.id !== findUser.id ? 'public' : undefined,
      filter,
      pagination: {
        limit: pageSize,
        offset: ~~cursor,
      },
    });
    dao.release();
    if (typeof listsList === 'undefined') {
      return httpInternalServerErrorResponse(res);
    }

    return httpSuccessResponse(res, {
      data: listsList,
      nextCursor: listsList.length === pageSize ? ~~cursor + 1 : undefined,
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
      { id: string }
    >,
    res: TypedResponse<{ data?: number; message: string }>
  ) => {
    const { filter = 'all' } = req.query;
    const { id } = req.params;

    const dao = new DAO();
    const findUser = await dao.getUser({ id });
    if (typeof findUser === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res, 'User not found');
    }

    if (filter === 'likes') {
      const likes = await dao.getLikeList({
        userid: findUser.id,
        isCount: true,
      });
      dao.release();

      if (typeof likes === 'undefined') {
        return httpInternalServerErrorResponse(res);
      }

      return httpSuccessResponse(res, { data: likes });
    }

    const posts = await dao.getPostList({
      userid: findUser.id,
      filter,
      isCount: true,
    });
    dao.release();

    if (typeof posts === 'undefined') {
      return httpInternalServerErrorResponse(res);
    }

    return httpSuccessResponse(res, { data: posts });
  }
);

// "GET /api/users/:id/follow"
// 특정 유저 팔로우 정보
apiUsersRouter.get(
  '/:id/follow',
  async (
    req: TypedRequestQueryParams<
      {
        cursor?: string;
        type?: 'verified_followers' | 'follow' | 'following';
        size?: string;
      },
      { id: string }
    >,
    res: TypedResponse<{
      data?: AdvancedUser[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor = '0', type, size = '10' } = req.query;
    const { id } = req.params;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    if (
      !type ||
      !['verified_followers', 'follow', 'following'].includes(type)
    ) {
      return httpBadRequestResponse(res);
    }

    const dao = new DAO();
    const findUser = await dao.getUser({ id });
    if (typeof findUser === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res);
    }

    const userList = await dao.getUserList({
      sessionid: findUser.id,
      verified: type === 'verified_followers' ? true : undefined,
      relation: type === 'following' ? 'Following' : 'Follow',
      self: true,
      pagination: {
        limit: pageSize,
        offset: ~~cursor,
      },
    });
    dao.release();

    if (typeof userList === 'undefined') {
      return httpInternalServerErrorResponse(res);
    }

    return httpSuccessResponse(res, {
      data: userList,
      nextCursor: userList.length === pageSize ? ~~cursor + 1 : undefined,
    });
  }
);

// "POST /api/users/:id/follow"
// 특정 유저 팔로우
apiUsersRouter.post(
  '/:id/follow',
  async (
    req: TypedRequestParams<{ id: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { id } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res, 'please login first');

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const targetUser = await dao.getUser({ id });
    if (typeof targetUser === 'undefined') {
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
    req: TypedRequestParams<{ id: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { id } = req.params;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const targetUser = await dao.getUser({ id });
    if (typeof targetUser === 'undefined') {
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

export default apiUsersRouter;
