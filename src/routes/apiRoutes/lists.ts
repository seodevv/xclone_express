import { AdvancedLists, Lists } from '@/model/Lists';
import {
  COOKIE_OPTIONS,
  decodingUserToken,
  removingFiles,
  storage,
} from '@/lib/common';
import DAO from '@/lib/DAO';
import {
  httpBadRequestResponse,
  httpCreatedResponse,
  httpForbiddenResponse,
  httpNotFoundResponse,
  httpSuccessResponse,
  httpUnAuthorizedResponse,
} from '@/lib/responsesHandlers';
import {
  TypedRequestBody,
  TypedRequestBodyParams,
  TypedRequestParams,
  TypedRequestQueryParams,
} from '@/model/Request';
import { TypedResponse } from '@/model/Response';
import express from 'express';
import multer from 'multer';
import { REGEX_NUMBER_ONLY } from '@/lib/regex';
import { AdvancedUser } from '@/model/User';
import { AdvancedPost } from '@/model/Post';

const apiListsRouter = express.Router();
const upload = multer({ storage });

// "POST /api/lists"
// 새로운 리스트를 생성
apiListsRouter.post(
  '/',
  upload.fields([
    { name: 'banner', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  (
    req: TypedRequestBody<{
      name?: string;
      description?: string;
      make?: string;
    }>,
    res: TypedResponse<{ data?: Lists; message: string }>
  ) => {
    const { name, description, make } = req.body;
    const files = req.files;
    const { 'connect.sid': token } = req.cookies;

    console.log(files);
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
      banner = [{ filename: 'lists_default.png' }],
      thumbnail = [{ filename: 'lists_default.png' }],
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

// "GET /api/lists/:id"
// 특정 리스트를 조회
apiListsRouter.get(
  '/:id',
  (
    req: TypedRequestQueryParams<{ userId?: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedLists; message: string }>
  ) => {
    const userId = req.query.userId;
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
    const make = currentUser.id !== userId ? 'public' : undefined;
    const findLists = dao.getLists({ id: ~~id, userId, make });
    if (!findLists) {
      return httpNotFoundResponse(res);
    }

    return httpSuccessResponse(res, { data: findLists });
  }
);

// "GET /api/lists/:id/posts"
// 특정 리스트의 게시글을 조회
apiListsRouter.get(
  '/:id/posts',
  (
    req: TypedRequestQueryParams<
      { userId?: string; cursor?: string; size?: string },
      { id: string }
    >,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { userId, cursor, size = '10' } = req.query;
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
    const make = currentUser.id !== userId ? 'public' : undefined;
    const findLists = dao.getLists({ id: ~~id, userId, make });
    if (!findLists) {
      return httpNotFoundResponse(res);
    }

    const memberIds = findLists.member.map((m) => m.id);
    const postList = dao
      .getPostList({ followIds: memberIds, withPostIds: findLists.posts })
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
      { userId?: string; cursor?: string; size?: string },
      { id: string }
    >,
    res: TypedResponse<{
      data?: AdvancedUser[];
      nextCursor?: string;
      message: string;
    }>
  ) => {
    const { userId, cursor, size = '10' } = req.query;
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
    const findLists = dao.getLists({ id: ~~id, userId });
    if (!findLists) {
      return httpNotFoundResponse(res);
    }

    const memberIds = findLists.member.map((m) => m.id);
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
    const findLists = dao.getLists({ id: ~~id, userId: currentUser.id });
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
    const updatedLists = dao.getLists({ id: findLists.id });

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
    const findLists = dao.getLists({ id: ~~id, userId: currentUser.id });
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
    const updatedLists = dao.getLists({ id: findLists.id });

    return httpCreatedResponse(res, { data: updatedLists });
  }
);

// "GET /api/lists/:id/follow"
// 특정 리스트의 팔로워를 조회
apiListsRouter.get(
  '/:id/follow',
  (
    req: TypedRequestQueryParams<
      { userId?: string; cursor?: string; size?: string },
      { id: string }
    >,
    res: TypedResponse<{
      data?: AdvancedUser[];
      nextCursor?: string;
      message: string;
    }>
  ) => {
    const { userId, cursor, size = '10' } = req.query;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (!userId || !REGEX_NUMBER_ONLY.test(id)) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findLists = dao.getLists({ id: ~~id, userId });
    if (!findLists) {
      return httpNotFoundResponse(res);
    }

    const followerIds = findLists.follower.map((f) => f.id);
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
    const findLists = dao.getLists({ id: ~~id });
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
    const updatedLists = dao.getLists({ id: findLists.id });

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
    const findLists = dao.getLists({ id: ~~id });
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
    const updatedLists = dao.getLists({ id: findLists.id });

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
    const findLists = dao.getLists({ userId: currentUser.id, id: ~~id });
    const findPost = dao.getPost({ postId: ~~postId });
    if (!findLists || !findPost) {
      return httpNotFoundResponse(res);
    }

    const already = dao.getListsDetail({
      type: 'post',
      listId: findLists.id,
      userId: currentUser.id,
      postId: findPost.postId,
    });
    if (already) {
      return httpForbiddenResponse(res, 'Posts already added to this list');
    }

    dao.listsDetailHandler({
      method: 'post',
      type: 'post',
      listId: findLists.id,
      userId: currentUser.id,
      postId: findPost.postId,
    });

    const updatedLists = dao.getLists({ id: findLists.id });

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
    const findLists = dao.getLists({ id: ~~id, userId: currentUser.id });
    const findPost = dao.getPost({ postId: ~~postId });
    if (!findLists || !findPost) {
      return httpNotFoundResponse(res);
    }

    const already = dao.getListsDetail({
      type: 'post',
      listId: findLists.id,
      userId: currentUser.id,
      postId: findPost.postId,
    });
    if (!already) {
      return httpForbiddenResponse(
        res,
        'This post is not already on the list.'
      );
    }

    dao.listsDetailHandler({
      method: 'delete',
      type: 'post',
      listId: findLists.id,
      userId: currentUser.id,
      postId: findPost.postId,
    });

    const updatedLists = dao.getLists({ id: findLists.id });

    return httpSuccessResponse(res, { data: updatedLists });
  }
);

export default apiListsRouter;
