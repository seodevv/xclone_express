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
import DAO from '@/lib/DAO';
import {
  httpBadRequestResponse,
  httpCreatedResponse,
  httpForbiddenResponse,
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

const apiListsRouter = express.Router();
const upload = multer({ storage });

// "GET /api/lists"
// 리스트를 검색
apiListsRouter.get(
  '/',
  (
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

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    let searchListsList = dao
      .getListsList({ sessionId: currentUser.id, make: 'public' })
      .filter((l) => l.userId !== currentUser.id)
      .sort((a, b) => {
        if (a.Follower.length > b.Follower.length) return -1;
        else if (a.Follower.length < b.Follower.length) return 1;
        return a.createAt > b.createAt ? 1 : -1;
      });

    if (q) {
      const decode = decodeURIComponent(q);
      const regex = new RegExp(
        `${decode.toLowerCase().replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&')}`
      );
      searchListsList = searchListsList.filter((l) =>
        regex.test(l.name.toLowerCase())
      );
    }

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

    const currentUser = decodingUserToken(token);
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
    const newList = dao.createList({
      userId: currentUser.id,
      name,
      description,
      banner: banner[0].filename,
      thumbnail: thumbnail[0].filename,
      make,
    });

    return httpSuccessResponse(res, { data: newList });
  }
);

// "GET /api/lists/recommends"
// 리스트를 추천
apiListsRouter.get(
  '/recommends',
  (
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

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const listsList = dao
      .getListsList({
        sessionId: currentUser.id,
        make: 'public',
      })
      .filter(
        (l) =>
          l.userId !== currentUser.id &&
          !l.Follower.map((f) => f.id).includes(currentUser.id)
      )
      .sort((a, b) => {
        if (a.Follower.length > b.Follower.length) return -1;
        if (b.Follower.length > a.Follower.length) return 1;
        return a.createAt > b.createAt ? 1 : -1;
      });

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
  (
    req: TypedRequestQueryParams<{ userId?: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({
      id: ~~id,
      sessionId: currentUser.id,
    });
    if (!findLists) {
      return httpNotFoundResponse(res);
    }

    if (findLists.userId !== currentUser.id && findLists.make === 'private') {
      return httpNotFoundResponse(res);
    }

    return httpSuccessResponse(res, { data: findLists });
  }
);

// "DELETE /api/lists/:id"
// 특정 리스트를 삭제
apiListsRouter.delete(
  '/:id',
  (req: TypedRequestParams<{ id: string }>, res: TypedResponse<{}>) => {
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({
      id: ~~id,
      sessionId: currentUser.id,
      userId: currentUser.id,
    });
    if (!findLists) {
      return httpNotFoundResponse(res);
    }

    dao.deleteLists({ id: findLists.id, userId: findLists.userId });

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
  (
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

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      removingFiles(files);
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({
      id: ~~id,
      sessionId: currentUser.id,
      userId: currentUser.id,
    });
    if (!findLists) {
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

    const updateLists = dao.updateLists({
      id: findLists.id,
      userId: findLists.userId,
      name,
      description,
      banner,
      thumbnail,
      make,
    });

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
  (
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

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({
      id: ~~id,
      sessionId: currentUser.id,
    });
    if (!findLists) {
      return httpNotFoundResponse(res);
    }

    if (findLists.userId !== currentUser.id && findLists.make === 'private') {
      return httpNotFoundResponse(res);
    }

    const postList = dao
      .getPostList({})
      .filter((p) => findLists.Posts.includes(p.postId))
      .sort((a, b) => (a.createAt > b.createAt ? -1 : 1));

    if (cursor && REGEX_NUMBER_ONLY.test(cursor)) {
      const findIndex = postList.findIndex((p) => p.postId === ~~cursor);
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
      nextCursor: sizeOver ? postList.at(-1)?.postId : undefined,
    });
  }
);

// "GET /api/lists/:id/member"
// 리스트의 멤버를 조회
apiListsRouter.get(
  '/:id/member',
  (
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

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({
      id: ~~id,
      sessionId: currentUser.id,
    });
    if (!findLists) {
      return httpNotFoundResponse(res);
    }

    if (findLists.userId !== currentUser.id && findLists.make === 'private') {
      return httpNotFoundResponse(res);
    }

    const memberIds = findLists.Member.map((m) => m.id);
    const userList = dao
      .getUserList()
      .filter((u) => memberIds.includes(u.id))
      .sort((a, b) => (a.id > b.id ? 1 : -1));

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
  (
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

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({
      id: ~~id,
      sessionId: currentUser.id,
      userId: currentUser.id,
    });
    if (!findLists) {
      return httpNotFoundResponse(res, 'Lists not found');
    }

    const findUser = dao.getUser({ id: memberId });
    if (!findUser) {
      return httpNotFoundResponse(res, 'User not found');
    }

    const already = dao.getListsDetail({
      type: 'member',
      listId: findLists.id,
      userId: findUser.id,
    });
    if (already) {
      return httpForbiddenResponse(res, 'This member already exists.');
    }

    dao.listsDetailHandler({
      method: 'post',
      listId: findLists.id,
      type: 'member',
      userId: memberId,
    });
    const updatedLists = dao.getLists({
      id: findLists.id,
      sessionId: currentUser.id,
    });

    return httpCreatedResponse(res, { data: updatedLists });
  }
);

// "DELETE /api/lists/:id/member"
// 특정 리스트의 멤버를 삭제
apiListsRouter.delete(
  '/:id/member',
  (
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

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({
      id: ~~id,
      sessionId: currentUser.id,
      userId: currentUser.id,
    });
    if (!findLists) {
      return httpNotFoundResponse(res, 'Lists not found');
    }

    const findUser = dao.getUser({ id: memberId });
    if (!findUser) {
      return httpNotFoundResponse(res, 'User not found');
    }

    const already = dao.getListsDetail({
      type: 'member',
      listId: findLists.id,
      userId: findUser.id,
    });
    if (!already) {
      return httpForbiddenResponse(res, 'This member already does not exist.');
    }

    dao.listsDetailHandler({
      method: 'delete',
      listId: findLists.id,
      type: 'member',
      userId: memberId,
    });
    const updatedLists = dao.getLists({
      id: findLists.id,
      sessionId: currentUser.id,
    });

    return httpCreatedResponse(res, { data: updatedLists });
  }
);

// "GET /api/lists/:id/follow"
// 특정 리스트의 팔로워를 조회
apiListsRouter.get(
  '/:id/follow',
  (
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

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({
      id: ~~id,
      sessionId: currentUser.id,
    });
    if (!findLists) {
      return httpNotFoundResponse(res);
    }

    if (findLists.userId !== currentUser.id && findLists.make === 'private') {
      return httpNotFoundResponse(res);
    }

    const followerIds = findLists.Follower.map((f) => f.id);
    const userList = dao
      .getUserList()
      .filter((u) => followerIds.includes(u.id))
      .sort((a, b) => (a.id > b.id ? 1 : -1));

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
  (
    req: TypedRequestParams<{ id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(id)) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({ id: ~~id, sessionId: currentUser.id });
    if (!findLists) {
      return httpNotFoundResponse(res, 'Lists not found');
    }

    if (findLists.userId === currentUser.id) {
      return httpForbiddenResponse(res, 'Can not follow your own list');
    }

    const already = dao.getListsDetail({
      type: 'follower',
      listId: findLists.id,
      userId: currentUser.id,
    });
    if (already) {
      return httpForbiddenResponse(res, 'You are already following.');
    }

    dao.listsDetailHandler({
      method: 'post',
      type: 'follower',
      listId: findLists.id,
      userId: currentUser.id,
    });
    const updatedLists = dao.getLists({
      id: findLists.id,
      sessionId: currentUser.id,
    });

    return httpCreatedResponse(res, { data: updatedLists });
  }
);

// "DELETE /api/lists/:id/follow"
// 특정 리스트를 언팔로우
apiListsRouter.delete(
  '/:id/follow',
  (
    req: TypedRequestParams<{ id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(id)) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({ id: ~~id, sessionId: currentUser.id });
    if (!findLists) {
      return httpNotFoundResponse(res, 'Lists not found');
    }

    if (findLists.userId === currentUser.id) {
      return httpForbiddenResponse(res, 'Can not unfollow your own list');
    }

    const already = dao.getListsDetail({
      type: 'follower',
      listId: findLists.id,
      userId: currentUser.id,
    });
    if (!already) {
      return httpForbiddenResponse(res, 'You are already unfollowing.');
    }

    dao.listsDetailHandler({
      method: 'delete',
      type: 'follower',
      listId: findLists.id,
      userId: currentUser.id,
    });
    const updatedLists = dao.getLists({
      id: findLists.id,
      sessionId: currentUser.id,
    });

    return httpCreatedResponse(res, { data: updatedLists });
  }
);

// "POST /api/lists/:id/post"
// 게시글을 특정 리스트에 추가
apiListsRouter.post(
  '/:id/post',
  (
    req: TypedRequestBodyParams<{ postId?: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const postId = req.body.postId;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (
      !postId ||
      !REGEX_NUMBER_ONLY.test(postId) ||
      !REGEX_NUMBER_ONLY.test(id)
    )
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({
      id: ~~id,
      sessionId: currentUser.id,
      userId: currentUser.id,
    });
    const findPost = dao.getPost({ postId: ~~postId });
    if (!findLists || !findPost) {
      return httpNotFoundResponse(res);
    }

    if (findLists.Posts.includes(findPost.postId)) {
      return httpForbiddenResponse(res, 'Posts already added to this list');
    }

    const memberIds = findLists.Member.map((m) => m.id);
    const memberPostIds = dao
      .getPostList({ followIds: memberIds })
      .map((p) => p.postId);
    const isMemberPost = memberPostIds.includes(findPost.postId);

    dao.listsDetailHandler({
      method: isMemberPost ? 'delete' : 'post',
      type: isMemberPost ? 'unpost' : 'post',
      listId: findLists.id,
      userId: currentUser.id,
      postId: findPost.postId,
    });

    const updatedLists = dao.getLists({
      id: findLists.id,
      sessionId: currentUser.id,
    });

    return httpSuccessResponse(res, { data: updatedLists });
  }
);

// "DELETE /api/lists/:id/post"
// 게시글을 특정 리스트에서 제거
apiListsRouter.delete(
  '/:id/post',
  (
    req: TypedRequestBodyParams<{ postId?: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const postId = req.body.postId;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (
      !postId ||
      !REGEX_NUMBER_ONLY.test(postId) ||
      !REGEX_NUMBER_ONLY.test(id)
    ) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({
      id: ~~id,
      sessionId: currentUser.id,
      userId: currentUser.id,
    });
    const findPost = dao.getPost({ postId: ~~postId });
    if (!findLists || !findPost) {
      return httpNotFoundResponse(res);
    }

    if (!findLists.Posts.includes(findPost.postId)) {
      return httpForbiddenResponse(
        res,
        'This post is not already on the list.'
      );
    }

    const memberIds = findLists.Member.map((m) => m.id);
    const memberPostIds = dao
      .getPostList({ followIds: memberIds })
      .map((p) => p.postId);
    const isMemberPost = memberPostIds.includes(findPost.postId);

    dao.listsDetailHandler({
      method: isMemberPost ? 'post' : 'delete',
      type: isMemberPost ? 'unpost' : 'post',
      listId: findLists.id,
      userId: currentUser.id,
      postId: findPost.postId,
    });

    const updatedLists = dao.getLists({
      id: findLists.id,
      sessionId: currentUser.id,
    });

    return httpSuccessResponse(res, { data: updatedLists });
  }
);

// "POST /api/lists/:id/pinned"
// 특정 리스트 pinned 설정
apiListsRouter.post(
  '/:id/pinned',
  (
    req: TypedRequestBodyParams<{ userId?: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const userId = req.body.userId;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!userId || !REGEX_NUMBER_ONLY.test(id))
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({
      id: ~~id,
      sessionId: currentUser.id,
      userId,
    });
    if (!findLists) {
      return httpNotFoundResponse(res);
    }

    const already = dao.getListsDetail({
      listId: findLists.id,
      type: 'pinned',
      userId: currentUser.id,
    });
    if (already) {
      return httpForbiddenResponse(res, 'This list is already pinned.');
    }

    dao.listsDetailHandler({
      method: 'post',
      listId: findLists.id,
      type: 'pinned',
      userId: currentUser.id,
    });

    const updatedLists = dao.getLists({
      id: findLists.id,
      sessionId: currentUser.id,
    });
    return httpSuccessResponse(res, { data: updatedLists });
  }
);

// "DELETE /api/lists/:id/pinned"
// 특정 리스트 pinned 제거
apiListsRouter.delete(
  '/:id/pinned',
  (
    req: TypedRequestBodyParams<{ userId: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const userId = req.body.userId;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!userId || !REGEX_NUMBER_ONLY.test(id))
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({
      id: ~~id,
      sessionId: currentUser.id,
      userId,
    });
    if (!findLists) {
      return httpNotFoundResponse(res);
    }

    const already = dao.getListsDetail({
      listId: findLists.id,
      type: 'pinned',
      userId: currentUser.id,
    });
    if (!already) {
      return httpForbiddenResponse(res, 'This list is not already pinned.');
    }

    dao.listsDetailHandler({
      method: 'delete',
      listId: findLists.id,
      type: 'pinned',
      userId: currentUser.id,
    });

    const updatedLists = dao.getLists({
      id: findLists.id,
      sessionId: currentUser.id,
    });
    return httpSuccessResponse(res, { data: updatedLists });
  }
);

// "POST /api/lists/:id/unshow"
// 특정 리스트 show 설정
apiListsRouter.post(
  '/:id/unshow',
  (
    req: TypedRequestBodyParams<{ userId?: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const userId = req.body.userId;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!userId || !REGEX_NUMBER_ONLY.test(id))
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({
      id: ~~id,
      sessionId: currentUser.id,
      userId,
    });
    if (!findLists) {
      return httpNotFoundResponse(res);
    }

    const already = dao.getListsDetail({
      listId: findLists.id,
      type: 'unshow',
      userId: currentUser.id,
    });
    if (already) {
      return httpForbiddenResponse(res, 'This list is already unshowed.');
    }

    dao.listsDetailHandler({
      method: 'post',
      listId: findLists.id,
      type: 'unshow',
      userId: currentUser.id,
    });

    const updatedLists = dao.getLists({
      id: findLists.id,
      sessionId: currentUser.id,
    });
    return httpSuccessResponse(res, { data: updatedLists });
  }
);

// "DELETE /api/lists/:id/unshow"
// 특정 리스트 show 제거
apiListsRouter.delete(
  '/:id/unshow',
  (
    req: TypedRequestBodyParams<{ userId: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const userId = req.body.userId;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!userId || !REGEX_NUMBER_ONLY.test(id))
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({
      id: ~~id,
      sessionId: currentUser.id,
      userId,
    });
    if (!findLists) {
      return httpNotFoundResponse(res);
    }

    const already = dao.getListsDetail({
      listId: findLists.id,
      type: 'unshow',
      userId: currentUser.id,
    });
    if (!already) {
      return httpForbiddenResponse(res, 'This list is not already unshowed.');
    }

    dao.listsDetailHandler({
      method: 'delete',
      listId: findLists.id,
      type: 'unshow',
      userId: currentUser.id,
    });

    const updatedLists = dao.getLists({
      id: findLists.id,
      sessionId: currentUser.id,
    });
    return httpSuccessResponse(res, { data: updatedLists });
  }
);

export default apiListsRouter;
