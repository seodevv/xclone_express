import fs from 'fs-extra';
import path from 'path';
import { AdvancedLists } from '@/model/Lists';
import {
  COOKIE_CLEAR_OPTIONS,
  decodingUserToken,
  delay,
  IMAGE_DEFAULT_LISTS,
  removingFiles,
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
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const fileName = `${Date.now()}_${Buffer.from(
      file.originalname,
      'latin1'
    ).toString('utf8')}`;
    cb(null, fileName);
  },
});
const upload = multer({ storage });

// "GET /api/lists"
// 리스트를 검색
apiListsRouter.get(
  '/',
  async (
    req: TypedRequestQuery<{
      q?: string;
      cursor?: string;
      size?: string;
      includeSelf?: string;
    }>,
    res: TypedResponse<{
      data?: AdvancedLists[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    await delay(1000);
    const { cursor = '0', size = '10', q, includeSelf } = req.query;
    const { 'access.token': token } = req.cookies;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const searchListsList = await dao.getListsList({
      sessionid: currentUser.id,
      make: 'public',
      q,
      includeSelf: !!includeSelf,
      sort: 'Follower',
      pagination: {
        limit: pageSize,
        offset: ~~cursor,
      },
    });
    dao.release();

    if (typeof searchListsList === 'undefined') {
      return httpInternalServerErrorResponse(res);
    }

    return httpSuccessResponse(res, {
      data: searchListsList,
      nextCursor:
        searchListsList.length === pageSize ? ~~cursor + 1 : undefined,
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
    const { 'access.token': token } = req.cookies;

    if (
      !name ||
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
    if (typeof currentUser === 'undefined') {
      removingFiles(files);
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
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
    const { cursor = '0', size = '10' } = req.query;
    const { 'access.token': token } = req.cookies;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const listsList = await dao.getListsList({
      sessionid: currentUser.id,
      make: 'public',
      includeSelf: false,
      relation: 'Not Following',
      sort: 'Follower',
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

// "GET /api/lists/:listid"
// 특정 리스트를 조회
apiListsRouter.get(
  '/:listid',
  async (
    req: TypedRequestQueryParams<{ userid?: string }, { listid: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const listid = req.params.listid;
    const { 'access.token': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(listid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
    });
    dao.release();
    if (typeof findLists === 'undefined') {
      return httpNotFoundResponse(res);
    }

    if (findLists.userid !== currentUser.id && findLists.make === 'private') {
      return httpNotFoundResponse(res);
    }

    return httpSuccessResponse(res, { data: findLists });
  }
);

// "DELETE /api/lists/:listid"
// 내 리스트를 삭제
apiListsRouter.delete(
  '/:listid',
  async (
    req: TypedRequestParams<{ listid: string }>,
    res: TypedResponse<{}>
  ) => {
    const listid = req.params.listid;
    const { 'access.token': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(listid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
      userid: currentUser.id,
    });
    if (typeof findLists === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res);
    }

    await dao.deleteLists({ id: findLists.id });
    dao.release();

    if (findLists.banner !== IMAGE_DEFAULT_LISTS && findLists.banner !== '') {
      const imagePath = path.join(uploadPath, '/', findLists.banner);
      fs.removeSync(imagePath);
    }
    if (
      findLists.thumbnail !== IMAGE_DEFAULT_LISTS &&
      findLists.thumbnail !== ''
    ) {
      const imagePath = path.join(uploadPath, '/', findLists.thumbnail);
      fs.removeSync(imagePath);
    }

    return httpNoContentRepsonse(res);
  }
);

// "POST /api/lists/:listid/edit"
// 내 리스트를 업데이트
apiListsRouter.post(
  '/:listid/edit',
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
      { listid: string }
    >,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const listid = req.params.listid;
    const { name, description, make, def } = req.body;
    const files = req.files;
    const { 'access.token': token } = req.cookies;
    if (
      !REGEX_NUMBER_ONLY.test(listid) ||
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
    if (typeof currentUser === 'undefined') {
      removingFiles(files);
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
      userid: currentUser.id,
    });
    if (typeof findLists === 'undefined') {
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

    if (
      findLists.banner !== IMAGE_DEFAULT_LISTS &&
      findLists.banner !== updateLists?.banner &&
      findLists.banner !== ''
    ) {
      const imagePath = path.join(uploadPath, '/', findLists.banner);
      fs.removeSync(imagePath);
    }
    if (
      findLists.thumbnail !== IMAGE_DEFAULT_LISTS &&
      findLists.thumbnail !== updateLists?.thumbnail &&
      findLists.thumbnail !== ''
    ) {
      const imagePath = path.join(uploadPath, '/', findLists.thumbnail);
      fs.removeSync(imagePath);
    }
    return httpSuccessResponse(res, { data: updateLists });
  }
);

// "GET /api/lists/:listid/posts"
// 특정 리스트의 게시글을 조회
apiListsRouter.get(
  '/:listid/posts',
  async (
    req: TypedRequestQueryParams<
      { cursor?: string; size?: string },
      { listid: string }
    >,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const listid = req.params.listid;
    const { cursor = '0', size = '10' } = req.query;
    const { 'access.token': token } = req.cookies;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    if (!REGEX_NUMBER_ONLY.test(listid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
    });
    if (typeof findLists === 'undefined') {
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

    const postList = await dao.getPostListWithIds({
      postids: findLists.Posts,
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

// "GET /api/lists/:listid/member"
// 리스트의 멤버를 조회
apiListsRouter.get(
  '/:listid/member',
  async (
    req: TypedRequestQueryParams<
      { cursor?: string; size?: string },
      { listid: string }
    >,
    res: TypedResponse<{
      data?: AdvancedUser[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor = '0', size = '10' } = req.query;
    const listid = req.params.listid;
    const { 'access.token': token } = req.cookies;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    if (!REGEX_NUMBER_ONLY.test(listid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
    });
    if (typeof findLists === 'undefined') {
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

    const userList = await dao.getUserListWithIds({
      userids: findLists.Member.map((m) => m.id),
      sort: 'id',
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

// "POST /api/lists/:listid/member"
// 특정 리스트의 멤버를 추가
apiListsRouter.post(
  '/:listid/member',
  async (
    req: TypedRequestBodyParams<{ memberid?: string }, { listid: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const listid = req.params.listid;
    const memberid = req.body.memberid;
    const { 'access.token': token } = req.cookies;
    if (!memberid || !REGEX_NUMBER_ONLY.test(listid)) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
      userid: currentUser.id,
    });
    if (typeof findLists === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res, 'Lists not found');
    }

    const findUser = await dao.getUser({ id: memberid });
    if (typeof findUser === 'undefined') {
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
      userid: memberid,
    });
    if (typeof result === 'undefined') {
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

// "DELETE /api/lists/:listid/member"
// 특정 리스트의 멤버를 삭제
apiListsRouter.delete(
  '/:listid/member',
  async (
    req: TypedRequestBodyParams<{ memberid?: string }, { listid: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const listid = req.params.listid;
    const memberid = req.body.memberid;
    const { 'access.token': token } = req.cookies;
    if (!memberid || !REGEX_NUMBER_ONLY.test(listid)) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
      userid: currentUser.id,
    });
    if (typeof findLists === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res, 'Lists not found');
    }

    const findUser = await dao.getUser({ id: memberid });
    if (typeof findUser === 'undefined') {
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
      userid: memberid,
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

// "GET /api/lists/:listid/follow"
// 특정 리스트의 팔로워를 조회
apiListsRouter.get(
  '/:listid/follow',
  async (
    req: TypedRequestQueryParams<
      { cursor?: string; size?: string },
      { listid: string }
    >,
    res: TypedResponse<{
      data?: AdvancedUser[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor = '0', size = '10' } = req.query;
    const listid = req.params.listid;
    const { 'access.token': token } = req.cookies;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    if (!REGEX_NUMBER_ONLY.test(listid)) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
    });
    if (typeof findLists === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res);
    }

    if (findLists.userid !== currentUser.id && findLists.make === 'private') {
      dao.release();
      return httpNotFoundResponse(res);
    }

    const followerIds = findLists.Follower.map((f) => f.id);
    const userList = await dao.getUserListWithIds({
      userids: followerIds,
      sort: 'id',
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

// "POST /api/lists/:listid/follow"
// 특정 리스트를 팔로우
apiListsRouter.post(
  '/:listid/follow',
  async (
    req: TypedRequestParams<{ listid: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const listid = req.params.listid;
    const { 'access.token': token } = req.cookies;

    if (!REGEX_NUMBER_ONLY.test(listid)) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
      make: 'public',
    });
    if (typeof findLists === 'undefined') {
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

// "DELETE /api/lists/:listid/follow"
// 특정 리스트를 언팔로우
apiListsRouter.delete(
  '/:listid/follow',
  async (
    req: TypedRequestParams<{ listid: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const listid = req.params.listid;
    const { 'access.token': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(listid)) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
      make: 'public',
    });
    if (typeof findLists === 'undefined') {
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

// "POST /api/lists/:listid/post"
// 게시글을 특정 리스트에 추가
apiListsRouter.post(
  '/:listid/post',
  async (
    req: TypedRequestBodyParams<{ postid?: string }, { listid: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const listid = req.params.listid;
    const postid = req.body.postid;
    const { 'access.token': token } = req.cookies;
    if (
      !postid ||
      !REGEX_NUMBER_ONLY.test(postid) ||
      !REGEX_NUMBER_ONLY.test(listid)
    )
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
      userid: currentUser.id,
    });
    if (typeof findLists === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res);
    }

    const findPost = await dao.getPost({ postid: ~~postid });
    if (typeof findPost === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res);
    }

    if (findLists.Posts.includes(findPost.postid)) {
      dao.release();
      return httpForbiddenResponse(res, 'Posts already added to this list');
    }

    const memberPostList = await dao.getPostListWithIds({
      userids: findLists.Member.map((m) => m.id),
    });
    if (typeof memberPostList === 'undefined') {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }
    const isMemberPost = memberPostList
      .map((p) => p.postid)
      .includes(findPost.postid);

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

// "DELETE /api/lists/:listid/post"
// 게시글을 특정 리스트에서 제거
apiListsRouter.delete(
  '/:listid/post',
  async (
    req: TypedRequestBodyParams<{ postid?: string }, { listid: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const listid = req.params.listid;
    const postid = req.body.postid;
    const { 'access.token': token } = req.cookies;
    if (
      !postid ||
      !REGEX_NUMBER_ONLY.test(postid) ||
      !REGEX_NUMBER_ONLY.test(listid)
    ) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
      userid: currentUser.id,
    });
    if (typeof findLists === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res);
    }

    const findPost = await dao.getPost({ postid: ~~postid });
    if (typeof findPost === 'undefined') {
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

    const memberpostids = await dao.getPostListWithIds({
      userids: findLists.Member.map((u) => u.id),
    });
    if (typeof memberpostids === 'undefined') {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }
    const isMemberPost = memberpostids
      .map((p) => p.postid)
      .includes(findPost.postid);

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

// "POST /api/lists/:listid/pinned"
// 특정 리스트 pinned 설정
apiListsRouter.post(
  '/:listid/pinned',
  async (
    req: TypedRequestBodyParams<{ userid?: string }, { listid: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const listid = req.params.listid;
    const userid = req.body.userid;
    const { 'access.token': token } = req.cookies;
    if (!userid || !REGEX_NUMBER_ONLY.test(listid))
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
      userid,
      make: currentUser.id !== userid ? 'public' : undefined,
    });
    if (typeof findLists === 'undefined') {
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

// "DELETE /api/lists/:listid/pinned"
// 특정 리스트 pinned 제거
apiListsRouter.delete(
  '/:listid/pinned',
  async (
    req: TypedRequestBodyParams<{ userid: string }, { listid: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const listid = req.params.listid;
    const userid = req.body.userid;
    const { 'access.token': token } = req.cookies;
    if (!userid || !REGEX_NUMBER_ONLY.test(listid))
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
      userid,
      make: currentUser.id !== userid ? 'public' : undefined,
    });
    if (typeof findLists === 'undefined') {
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

// "POST /api/lists/:listid/unshow"
// 특정 리스트 show 설정
apiListsRouter.post(
  '/:listid/unshow',
  async (
    req: TypedRequestBodyParams<{ userid?: string }, { listid: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const listid = req.params.listid;
    const userid = req.body.userid;
    const { 'access.token': token } = req.cookies;
    if (!userid || !REGEX_NUMBER_ONLY.test(listid))
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
      userid,
      make: currentUser.id !== userid ? 'public' : undefined,
    });
    if (typeof findLists === 'undefined') {
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

// "DELETE /api/lists/:listid/unshow"
// 특정 리스트 show 제거
apiListsRouter.delete(
  '/:listid/unshow',
  async (
    req: TypedRequestBodyParams<{ userid: string }, { listid: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const listid = req.params.listid;
    const userid = req.body.userid;
    const { 'access.token': token } = req.cookies;
    if (!userid || !REGEX_NUMBER_ONLY.test(listid))
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('access.token', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = await dao.getLists({
      sessionid: currentUser.id,
      id: ~~listid,
      userid,
      make: currentUser.id !== userid ? 'public' : undefined,
    });
    if (typeof findLists === 'undefined') {
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
