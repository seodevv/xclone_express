import fs from 'fs-extra';
import path from 'path';
import { AdvancedLists } from '@/model/Lists';
import {
  COOKIE_OPTIONS,
  decodingUserToken,
  delay,
  IMAGE_DEFAULT_LISTS,
  removingFiles,
  storage,
} from '@/lib/common';
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
import {
  TypedRequestBody,
  TypedRequestBodyParams,
  TypedRequestParams,
  TypedRequestQuery,
  TypedRequestQueryParams,
} from '@/model/Request';
import { TypedResponse } from '@/model/Response';
import express from 'express';
import multer from 'multer';
import { REGEX_NUMBER_ONLY } from '@/lib/regex';
import { AdvancedUser } from '@/model/User';
import { AdvancedPost } from '@/model/Post';
import { uploadPath } from '@/app';
import DAO from '@/lib/DAO';

const apiListsRouter = express.Router();
const upload = multer({ storage });

// "GET /api/lists"
// 리스트를 검색
apiListsRouter.get(
  '/',
  async (
    req: TypedRequestQuery<{ q?: string; cursor?: string; size?: string }>,
    res: TypedResponse<{
      data?: AdvancedLists[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { q, cursor, size = '10' } = req.query;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    let searchListsList = await dao.getListsList({
      sessionid: currentUser.id,
      make: 'public',
      q,
    });
    dao.release();

    if (!searchListsList) {
      return httpInternalServerErrorResponse(res);
    }

    searchListsList = searchListsList
      .filter((l) => l.userid !== currentUser.id)
      .sort((a, b) => {
        if (a.Follower.length > b.Follower.length) return -1;
        else if (a.Follower.length < b.Follower.length) return 1;
        return a.createat > b.createat ? 1 : -1;
      });

    if (cursor && REGEX_NUMBER_ONLY.test(cursor)) {
      const findIndex = searchListsList.findIndex((l) => l.id === ~~cursor);
      if (findIndex > -1) {
        searchListsList.splice(0, findIndex + 1);
      }
    }

    const pageSize = REGEX_NUMBER_ONLY.test(size) && ~~size !== 0 ? ~~size : 0;
    const sizeOver = searchListsList.length > pageSize;
    if (sizeOver) {
      searchListsList.splice(pageSize);
    }

    return httpSuccessResponse(res, {
      data: searchListsList,
      nextCursor: sizeOver ? searchListsList.at(-1)?.id : undefined,
    });
  }
);

// "POST /api/lists"
// 새로운 리스트를 생성
apiListsRouter.post(
  '/',
  upload.fields([
    { name: 'banner', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  async (
    req: TypedRequestBody<{
      name?: string;
      description?: string;
      make?: string;
    }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    await delay(1000);
    const { name, description, make } = req.body;
    const files = req.files;
    const { 'connect.sid': token } = req.cookies;

    if (
      !name ||
      !make ||
      (make !== 'private' && make !== 'public') ||
      !files ||
      Array.isArray(files)
    ) {
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

    const {
      banner = [{ filename: IMAGE_DEFAULT_LISTS }],
      thumbnail = [{ filename: IMAGE_DEFAULT_LISTS }],
    } = files;

    const dao = new DAO();
    const newList = await dao.createList({
      sessionid: currentUser.id,
      userid: currentUser.id,
      name,
      description,
      banner: banner[0].filename,
      thumbnail: thumbnail[0].filename,
      make,
    });
    dao.release();

    return httpSuccessResponse(res, { data: newList });
  }
);

// "GET /api/lists/recommends"
// 리스트를 추천
apiListsRouter.get(
  '/recommends',
  async (
    req: TypedRequestQuery<{ cursor?: string; size?: string }>,
    res: TypedResponse<{
      data?: AdvancedLists[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor, size = '10' } = req.query;
    const { 'connect.sid': token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const listsList = (
      await dao.getListsList({
        sessionid: currentUser.id,
        make: 'public',
      })
    )
      ?.filter(
        (l) =>
          l.userid !== currentUser.id &&
          !l.Follower.map((f) => f.id).includes(currentUser.id)
      )
      .sort((a, b) => {
        if (a.Follower.length > b.Follower.length) return -1;
        if (b.Follower.length > a.Follower.length) return 1;
        return a.createat > b.createat ? 1 : -1;
      });
    dao.release();

    if (!listsList) {
      return httpInternalServerErrorResponse(res);
    }

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

// "GET /api/lists/:id"
// 특정 리스트를 조회
apiListsRouter.get(
  '/:id',
  async (
    req: TypedRequestQueryParams<{ userid?: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
    });
    dao.release();
    if (!findLists) {
      return httpNotFoundResponse(res);
    }

    if (findLists.userid !== currentUser.id && findLists.make === 'private') {
      return httpNotFoundResponse(res);
    }

    return httpSuccessResponse(res, { data: findLists });
  }
);

// "DELETE /api/lists/:id"
// 특정 리스트를 삭제
apiListsRouter.delete(
  '/:id',
  async (req: TypedRequestParams<{ id: string }>, res: TypedResponse<{}>) => {
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
      userid: currentUser.id,
    });
    if (!findLists) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    await dao.deleteLists({ id: findLists.id });
    dao.release();

    if (findLists.banner !== IMAGE_DEFAULT_LISTS) {
      const imagePath = path.join(uploadPath, '/', findLists.banner);
      fs.removeSync(imagePath);
    }
    if (findLists.thumbnail !== IMAGE_DEFAULT_LISTS) {
      const imagePath = path.join(uploadPath, '/', findLists.thumbnail);
      fs.removeSync(imagePath);
    }

    return httpNoContentRepsonse(res);
  }
);

// "POST /api/lists/:id/edit"
// 특정 리스트를 업데이트
apiListsRouter.post(
  '/:id/edit',
  upload.fields([
    { name: 'banner', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  async (
    req: TypedRequestBodyParams<
      {
        name?: string;
        description?: string;
        make?: string;
        def?: string;
      },
      { id: string }
    >,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const id = req.params.id;
    const { name, description, make, def } = req.body;
    const files = req.files;
    const { 'connect.sid': token } = req.cookies;
    if (
      !REGEX_NUMBER_ONLY.test(id) ||
      (typeof name !== 'undefined' && name === '') ||
      (typeof make !== 'undefined' &&
        make !== 'private' &&
        make !== 'public') ||
      typeof files === 'undefined' ||
      Array.isArray(files)
    ) {
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

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
      userid: currentUser.id,
    });
    if (!findLists) {
      dao.release();
      removingFiles(files);
      return httpNotFoundResponse(res);
    }

    const bannerFiles = files.banner || [
      { filename: def ? IMAGE_DEFAULT_LISTS : undefined },
    ];
    const thumbnailFiles = files.thumbnail || [
      { filename: def ? IMAGE_DEFAULT_LISTS : undefined },
    ];
    const banner = bannerFiles[0].filename;
    const thumbnail = thumbnailFiles[0].filename;

    const updateLists = await dao.updateLists({
      id: findLists.id,
      userid: findLists.userid,
      name,
      description,
      banner,
      thumbnail,
      make,
    });
    dao.release();

    if (findLists.banner !== IMAGE_DEFAULT_LISTS) {
      const imagePath = path.join(uploadPath, '/', findLists.banner);
      fs.removeSync(imagePath);
    }
    if (findLists.thumbnail !== IMAGE_DEFAULT_LISTS) {
      const imagePath = path.join(uploadPath, '/', findLists.thumbnail);
      fs.removeSync(imagePath);
    }
    return httpSuccessResponse(res, { data: updateLists });
  }
);

// "GET /api/lists/:id/posts"
// 특정 리스트의 게시글을 조회
apiListsRouter.get(
  '/:id/posts',
  async (
    req: TypedRequestQueryParams<
      { cursor?: string; size?: string },
      { id: string }
    >,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor, size = '10' } = req.query;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
    });
    if (!findLists) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    if (findLists.userid !== currentUser.id && findLists.make === 'private') {
      dao.release();
      return httpNotFoundResponse(res);
    }

    if (findLists.Posts.length === 0) {
      dao.release();
      return httpSuccessResponse(res, { data: [] });
    }

    const postList = await dao.getPostListWithIds({ postids: findLists.Posts });
    dao.release();
    if (!postList) {
      return httpInternalServerErrorResponse(res);
    }

    if (cursor && REGEX_NUMBER_ONLY.test(cursor)) {
      const findIndex = postList.findIndex((p) => p.postid === ~~cursor);
      if (findIndex > -1) {
        postList.splice(0, findIndex + 1);
      }
    }

    const pageSize = REGEX_NUMBER_ONLY.test(size) && ~~size !== 0 ? ~~size : 10;
    const sizeOver = postList.length > pageSize;
    if (sizeOver) {
      postList.splice(pageSize);
    }

    return httpSuccessResponse(res, {
      data: postList,
      nextCursor: sizeOver ? postList.at(-1)?.postid : undefined,
    });
  }
);

// "GET /api/lists/:id/member"
// 리스트의 멤버를 조회
apiListsRouter.get(
  '/:id/member',
  async (
    req: TypedRequestQueryParams<
      { cursor?: string; size?: string },
      { id: string }
    >,
    res: TypedResponse<{
      data?: AdvancedUser[];
      nextCursor?: string;
      message: string;
    }>
  ) => {
    const { cursor, size = '10' } = req.query;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
    });
    if (!findLists) {
      dao.release();
      return httpNotFoundResponse(res);
    }
    if (findLists.userid !== currentUser.id && findLists.make === 'private') {
      dao.release();
      return httpNotFoundResponse(res);
    }
    if (findLists.Member.length === 0) {
      dao.release();
      return httpSuccessResponse(res, { data: [] });
    }

    const memberIds = findLists.Member.map((m) => m.id);
    const userList = (
      await dao.getUserListWithIds({ userids: memberIds })
    )?.sort((a, b) => (a.id > b.id ? 1 : -1));
    dao.release();
    if (!userList) {
      return httpInternalServerErrorResponse(res);
    }

    if (cursor) {
      const findIndex = userList.findIndex((u) => u.id === cursor);
      if (findIndex > -1) {
        userList.splice(0, findIndex + 1);
      }
    }

    const pageSize = REGEX_NUMBER_ONLY.test(size)
      ? ~~size !== 0
        ? ~~size
        : 10
      : 10;
    const sizeOver = userList.length > pageSize;
    if (sizeOver) {
      userList.splice(pageSize);
    }

    return httpSuccessResponse(res, {
      data: userList,
      nextCursor: sizeOver ? userList.at(-1)?.id : undefined,
    });
  }
);

// "POST /api/lists/:id/member"
// 특정 리스트의 멤버를 추가
apiListsRouter.post(
  '/:id/member',
  async (
    req: TypedRequestBodyParams<{ memberId?: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const id = req.params.id;
    const memberId = req.body.memberId;
    const { 'connect.sid': token } = req.cookies;
    if (!memberId || !REGEX_NUMBER_ONLY.test(id)) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
      userid: currentUser.id,
    });
    if (!findLists) {
      dao.release();
      return httpNotFoundResponse(res, 'Lists not found');
    }

    const findUser = await dao.getUser({ id: memberId });
    if (!findUser) {
      dao.release();
      return httpNotFoundResponse(res, 'User not found');
    }

    const already = await dao.getListsDetail({
      type: 'member',
      listid: findLists.id,
      userid: findUser.id,
    });
    if (already) {
      dao.release();
      return httpForbiddenResponse(res, 'This member already exists.');
    }

    const result = await dao.listsDetailHandler({
      method: 'post',
      listid: findLists.id,
      type: 'member',
      userid: memberId,
    });
    if (!result) {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }

    const updatedLists = await dao.getLists({
      sessionid: currentUser.id,
      id: findLists.id,
    });
    dao.release();
    return httpCreatedResponse(res, { data: updatedLists });
  }
);

// "DELETE /api/lists/:id/member"
// 특정 리스트의 멤버를 삭제
apiListsRouter.delete(
  '/:id/member',
  async (
    req: TypedRequestBodyParams<{ memberId?: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const id = req.params.id;
    const memberId = req.body.memberId;
    const { 'connect.sid': token } = req.cookies;
    if (!memberId || !REGEX_NUMBER_ONLY.test(id)) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
      userid: currentUser.id,
    });
    if (!findLists) {
      dao.release();
      return httpNotFoundResponse(res, 'Lists not found');
    }

    const findUser = await dao.getUser({ id: memberId });
    if (!findUser) {
      dao.release();
      return httpNotFoundResponse(res, 'User not found');
    }

    const already = await dao.getListsDetail({
      type: 'member',
      listid: findLists.id,
      userid: findUser.id,
    });
    if (!already) {
      dao.release();
      return httpForbiddenResponse(res, 'This member already does not exist.');
    }

    const result = await dao.listsDetailHandler({
      method: 'delete',
      listid: findLists.id,
      type: 'member',
      userid: memberId,
    });
    if (!result) {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }
    const updatedLists = await dao.getLists({
      sessionid: currentUser.id,
      id: findLists.id,
    });
    dao.release();
    return httpCreatedResponse(res, { data: updatedLists });
  }
);

// "GET /api/lists/:id/follow"
// 특정 리스트의 팔로워를 조회
apiListsRouter.get(
  '/:id/follow',
  async (
    req: TypedRequestQueryParams<
      { cursor?: string; size?: string },
      { id: string }
    >,
    res: TypedResponse<{
      data?: AdvancedUser[];
      nextCursor?: string;
      message: string;
    }>
  ) => {
    const { cursor, size = '10' } = req.query;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(id)) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
    });
    if (!findLists) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    if (findLists.userid !== currentUser.id && findLists.make === 'private') {
      dao.release();
      return httpNotFoundResponse(res);
    }

    const followerIds = findLists.Follower.map((f) => f.id);
    const userList = (
      await dao.getUserListWithIds({ userids: followerIds })
    )?.sort((a, b) => (a.id > b.id ? 1 : -1));
    dao.release();
    if (!userList) {
      return httpInternalServerErrorResponse(res);
    }

    if (cursor) {
      const findIndex = userList.findIndex((u) => u.id === cursor);
      if (findIndex > -1) {
        userList.splice(0, findIndex + 1);
      }
    }

    const pageSize = REGEX_NUMBER_ONLY.test(size)
      ? ~~size !== 0
        ? ~~size
        : 10
      : 10;
    const sizeOver = userList.length > pageSize;
    if (sizeOver) {
      userList.splice(pageSize);
    }

    return httpSuccessResponse(res, {
      data: userList,
      nextCursor: sizeOver ? userList.at(-1)?.id : undefined,
    });
  }
);

// "POST /api/lists/:id/follow"
// 특정 리스트를 팔로우
apiListsRouter.post(
  '/:id/follow',
  async (
    req: TypedRequestParams<{ id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(id)) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
      make: 'public',
    });
    if (!findLists) {
      dao.release();
      return httpNotFoundResponse(res, 'Lists not found');
    }

    if (findLists.userid === currentUser.id) {
      dao.release();
      return httpForbiddenResponse(res, 'Can not follow your own list');
    }

    const already = await dao.getListsDetail({
      type: 'follower',
      listid: findLists.id,
      userid: currentUser.id,
    });
    if (already) {
      dao.release();
      return httpForbiddenResponse(res, 'You are already following.');
    }

    const result = await dao.listsDetailHandler({
      method: 'post',
      type: 'follower',
      listid: findLists.id,
      userid: currentUser.id,
    });
    if (!result) {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }
    const updatedLists = await dao.getLists({
      sessionid: currentUser.id,
      id: findLists.id,
    });
    dao.release();

    return httpCreatedResponse(res, { data: updatedLists });
  }
);

// "DELETE /api/lists/:id/follow"
// 특정 리스트를 언팔로우
apiListsRouter.delete(
  '/:id/follow',
  async (
    req: TypedRequestParams<{ id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(id)) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
      make: 'public',
    });
    if (!findLists) {
      dao.release();
      return httpNotFoundResponse(res, 'Lists not found');
    }

    if (findLists.userid === currentUser.id) {
      dao.release();
      return httpForbiddenResponse(res, 'Can not unfollow your own list');
    }

    const already = await dao.getListsDetail({
      type: 'follower',
      listid: findLists.id,
      userid: currentUser.id,
    });
    if (!already) {
      dao.release();
      return httpForbiddenResponse(res, 'You are already unfollowing.');
    }

    const result = await dao.listsDetailHandler({
      method: 'delete',
      type: 'follower',
      listid: findLists.id,
      userid: currentUser.id,
    });
    if (!result) {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }
    const updatedLists = await dao.getLists({
      sessionid: currentUser.id,
      id: findLists.id,
    });
    dao.release();
    return httpCreatedResponse(res, { data: updatedLists });
  }
);

// "POST /api/lists/:id/post"
// 게시글을 특정 리스트에 추가
apiListsRouter.post(
  '/:id/post',
  async (
    req: TypedRequestBodyParams<{ postid?: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const postid = req.body.postid;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (
      !postid ||
      !REGEX_NUMBER_ONLY.test(postid) ||
      !REGEX_NUMBER_ONLY.test(id)
    )
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
      userid: currentUser.id,
    });
    const findPost = await dao.getPost({ postid: ~~postid });
    if (!findLists || !findPost) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    if (findLists.Posts.includes(findPost.postid)) {
      dao.release();
      return httpForbiddenResponse(res, 'Posts already added to this list');
    }

    const memberIds = findLists.Member.map((m) => m.id);
    const memberpostids = (
      await dao.getPostListWithIds({ userids: memberIds })
    )?.map((p) => p.postid);
    if (!memberpostids) {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }
    const isMemberPost = memberpostids.includes(findPost.postid);

    await dao.listsDetailHandler({
      method: isMemberPost ? 'delete' : 'post',
      type: isMemberPost ? 'unpost' : 'post',
      listid: findLists.id,
      userid: currentUser.id,
      postid: findPost.postid,
    });

    const updatedLists = await dao.getLists({
      sessionid: currentUser.id,
      id: findLists.id,
    });
    dao.release();

    return httpSuccessResponse(res, { data: updatedLists });
  }
);

// "DELETE /api/lists/:id/post"
// 게시글을 특정 리스트에서 제거
apiListsRouter.delete(
  '/:id/post',
  async (
    req: TypedRequestBodyParams<{ postid?: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const postid = req.body.postid;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (
      !postid ||
      !REGEX_NUMBER_ONLY.test(postid) ||
      !REGEX_NUMBER_ONLY.test(id)
    ) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
      userid: currentUser.id,
    });
    const findPost = await dao.getPost({ postid: ~~postid });
    if (!findLists || !findPost) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    if (!findLists.Posts.includes(findPost.postid)) {
      dao.release();
      return httpForbiddenResponse(
        res,
        'This post is not already on the list.'
      );
    }

    const memberIds = findLists.Member.map((m) => m.id);
    const memberpostids = (
      await dao.getPostListWithIds({ userids: memberIds })
    )?.map((p) => p.postid);
    if (!memberpostids) {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }
    const isMemberPost = memberpostids.includes(findPost.postid);

    await dao.listsDetailHandler({
      method: isMemberPost ? 'post' : 'delete',
      type: isMemberPost ? 'unpost' : 'post',
      listid: findLists.id,
      userid: currentUser.id,
      postid: findPost.postid,
    });

    const updatedLists = await dao.getLists({
      sessionid: currentUser.id,
      id: findLists.id,
    });

    return httpSuccessResponse(res, { data: updatedLists });
  }
);

// "POST /api/lists/:id/pinned"
// 특정 리스트 pinned 설정
apiListsRouter.post(
  '/:id/pinned',
  async (
    req: TypedRequestBodyParams<{ userid?: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const userid = req.body.userid;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!userid || !REGEX_NUMBER_ONLY.test(id))
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
      userid,
      make: currentUser.id !== userid ? 'public' : undefined,
    });
    if (!findLists) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    if (
      currentUser.id !== findLists.userid &&
      !findLists.Follower.map((u) => u.id).includes(currentUser.id)
    ) {
      dao.release();
      return httpForbiddenResponse(res, 'These lists are not being followed.');
    }

    if (findLists.Pinned) {
      dao.release();
      return httpForbiddenResponse(res, 'This list is already pinned.');
    }

    await dao.listsDetailHandler({
      method: 'post',
      listid: findLists.id,
      type: 'pinned',
      userid: currentUser.id,
    });
    const updatedLists = await dao.getLists({
      sessionid: currentUser.id,
      id: findLists.id,
    });
    dao.release();
    return httpSuccessResponse(res, { data: updatedLists });
  }
);

// "DELETE /api/lists/:id/pinned"
// 특정 리스트 pinned 제거
apiListsRouter.delete(
  '/:id/pinned',
  async (
    req: TypedRequestBodyParams<{ userid: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const userid = req.body.userid;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!userid || !REGEX_NUMBER_ONLY.test(id))
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
      userid,
      make: currentUser.id !== userid ? 'public' : undefined,
    });
    if (!findLists) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    if (
      currentUser.id !== findLists.userid &&
      !findLists.Follower.map((u) => u.id).includes(currentUser.id)
    ) {
      dao.release();
      return httpForbiddenResponse(res, 'These lists are not being followed.');
    }

    if (!findLists.Pinned) {
      dao.release();
      return httpForbiddenResponse(res, 'This list is not already pinned.');
    }

    await dao.listsDetailHandler({
      method: 'delete',
      listid: findLists.id,
      type: 'pinned',
      userid: currentUser.id,
    });

    const updatedLists = await dao.getLists({
      sessionid: currentUser.id,
      id: findLists.id,
    });
    dao.release();
    return httpSuccessResponse(res, { data: updatedLists });
  }
);

// "POST /api/lists/:id/unshow"
// 특정 리스트 show 설정
apiListsRouter.post(
  '/:id/unshow',
  async (
    req: TypedRequestBodyParams<{ userid?: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const userid = req.body.userid;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!userid || !REGEX_NUMBER_ONLY.test(id))
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
      userid,
      make: currentUser.id !== userid ? 'public' : undefined,
    });
    if (!findLists) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    if (findLists.UnShow.map((u) => u.id).includes(currentUser.id)) {
      dao.release();
      return httpForbiddenResponse(res, 'This list is already unshowed.');
    }

    await dao.listsDetailHandler({
      method: 'post',
      listid: findLists.id,
      type: 'unshow',
      userid: currentUser.id,
    });
    const updatedLists = await dao.getLists({
      sessionid: currentUser.id,
      id: findLists.id,
    });
    dao.release();
    return httpSuccessResponse(res, { data: updatedLists });
  }
);

// "DELETE /api/lists/:id/unshow"
// 특정 리스트 show 제거
apiListsRouter.delete(
  '/:id/unshow',
  async (
    req: TypedRequestBodyParams<{ userid: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const userid = req.body.userid;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!userid || !REGEX_NUMBER_ONLY.test(id))
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~id,
      userid,
      make: currentUser.id !== userid ? 'public' : undefined,
    });
    if (!findLists) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    if (!findLists.UnShow.map((u) => u.id).includes(currentUser.id)) {
      dao.release();
      return httpForbiddenResponse(res, 'This list is not already unshowed.');
    }

    await dao.listsDetailHandler({
      method: 'delete',
      listid: findLists.id,
      type: 'unshow',
      userid: currentUser.id,
    });
    const updatedLists = await dao.getLists({
      sessionid: currentUser.id,
      id: findLists.id,
    });
    dao.release;
    return httpSuccessResponse(res, { data: updatedLists });
  }
);

export default apiListsRouter;
