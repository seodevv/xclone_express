import express from 'express';
import multer from 'multer';
import fs from 'fs-extra';
import path from 'path';
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
  COOKIE_OPTIONS,
  decodingUserToken,
  delay,
  removingFiles,
  storage,
} from '@/lib/common';
import {
  TypedRequestBody,
  TypedRequestBodyParams,
  TypedRequestParams,
  TypedRequestQuery,
  TypedRequestQueryParams,
} from '@/model/Request';
import { TypedResponse } from '@/model/Response';
import { AdvancedPost, GifType, ImageType } from '@/model/Post';
import { uploadPath } from '@/app';
import { Views } from '@/model/Views';
import { REGEX_NUMBER_ONLY } from '@/lib/regex';
import { AdvancedUser } from '@/model/User';
import { PostImage } from '@/db/schema';
import DAO from '@/lib/DAO';

const apiPostsRouter = express.Router();
const upload = multer({ storage });

// "GET /api/posts"
// 검색 결과 페이지 조회
apiPostsRouter.get(
  '/',
  async (
    req: TypedRequestQuery<{
      cursor?: string;
      q?: string;
      pf?: 'on';
      lf?: 'on';
      f?: 'live' | 'user' | 'media' | 'lists';
    }>,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    await delay(1000);
    const { cursor, q, pf, lf, f } = req.query;
    const { 'connect.sid': token } = req.cookies;
    const pageSize = f === 'media' ? 12 : 10;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    let searchPostList = await dao.getPostList({});

    if (!searchPostList) {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }

    if (q) {
      const decode = decodeURIComponent(q);
      const regex = new RegExp(
        `${decode.toLowerCase().replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&')}`
      );
      searchPostList = searchPostList.filter((p) => {
        if (!p.Original) {
          if (
            regex.test(p.content.toLowerCase()) ||
            regex.test(p.User.id.toLowerCase()) ||
            regex.test(p.User.nickname.toLowerCase())
          ) {
            return true;
          }
          return false;
        }

        if (p.Original) {
          if (
            regex.test(p.Original.content.toLowerCase()) ||
            regex.test(p.Original.User.id.toLowerCase()) ||
            regex.test(p.Original.User.nickname.toLowerCase()) ||
            regex.test(p.User.id.toLowerCase()) ||
            regex.test(p.User.nickname.toLowerCase())
          ) {
            return true;
          }
          return false;
        }
        return false;
      });
    }

    if (!f) {
      searchPostList.sort((a, b) =>
        a._count.Hearts > b._count.Hearts ? -1 : 1
      );
    } else if (f === 'live') {
      searchPostList.sort((a, b) => (a.createat > b.createat ? -1 : 1));
    } else if (f === 'media') {
      searchPostList = searchPostList.filter(
        (p) => !p.Original && !p.Parent && p.images.length !== 0
      );
    }

    if (pf) {
      const followingList = (
        await dao.getFollowList({ source: currentUser.id })
      )?.map((f) => f.target);
      if (followingList) {
        searchPostList = searchPostList.filter((p) => {
          if (followingList.includes(p.User.id)) return true;
          return false;
        });
      }
    }
    dao.release();

    const regex = /^[0-9]*$/;
    if (cursor && regex.test(cursor)) {
      const findIndex = searchPostList.findIndex((p) => p.postid === ~~cursor);
      searchPostList.splice(0, findIndex + 1);
    }

    const prevLength = searchPostList.length;
    searchPostList.splice(pageSize);

    return httpSuccessResponse(res, {
      data: searchPostList,
      nextCursor:
        prevLength > pageSize ? searchPostList.at(-1)?.postid : undefined,
    });
  }
);

// "POST /api/posts"
// 게시물 생성
apiPostsRouter.post(
  '/',
  upload.array('images', 4),
  async (
    req: TypedRequestBody<{
      content?: string;
      mediaInfo?: string;
      repostid?: string;
    }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    await delay(3000);
    const { content, mediaInfo, repostid } = req.body;
    const files = req.files;
    const { 'connect.sid': token } = req.cookies;
    const media = mediaInfo
      ? (JSON.parse(mediaInfo) as (GifType | ImageType)[])
      : undefined;

    if (!files) return httpBadRequestResponse(res);
    if (!content && files.length === 0 && !media)
      return httpBadRequestResponse(res);
    if (!token) {
      removingFiles(files);
      return httpUnAuthorizedResponse(res);
    }

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      removingFiles(files);
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    if (repostid) {
      await dao.reactionHandler({
        method: 'post',
        type: 'Repost',
        postid: ~~repostid,
        userid: currentUser.id,
        quote: true,
      });
    }
    const newPost = await dao.createPost({
      userid: currentUser.id,
      content,
      files,
      media,
      originalid: repostid ? ~~repostid : undefined,
      quote: !!repostid,
    });
    dao.release();

    return httpCreatedResponse(res, { data: newPost });
  }
);

// "GET /api/posts/recommends"
// 추천 게시글 조회
apiPostsRouter.get(
  '/recommends',
  async (
    req: TypedRequestQuery<{ cursor?: string }>,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    await delay(1000);
    const { cursor = '' } = req.query;
    const pageSize = 10;

    const dao = new DAO();
    let recommendsList = await dao.getPostList({});
    dao.release();
    if (!recommendsList) {
      return httpInternalServerErrorResponse(res);
    }

    const regex = /^[0-9]+$/;
    if (cursor && regex.test(cursor)) {
      const findIndex = recommendsList.findIndex(
        (p) => p.postid === parseInt(cursor)
      );
      if (findIndex > -1) {
        recommendsList.splice(0, findIndex + 1);
      }
    }

    const prevLength = recommendsList.length;
    recommendsList.splice(pageSize);

    return httpSuccessResponse(res, {
      data: recommendsList,
      nextCursor:
        prevLength > pageSize ? recommendsList.at(-1)?.postid : undefined,
    });
  }
);

// "GET /api/posts/followings"
// 팔로잉 게시글 조회
apiPostsRouter.get(
  '/followings',
  async (
    req: TypedRequestQuery<{ cursor?: string }>,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor = '' } = req.query;
    const { 'connect.sid': token } = req.cookies;
    const pageSize = 10;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const followingList = (
      await dao.getFollowList({ source: currentUser.id })
    )?.map((f) => f.target);
    if (!followingList) {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }

    const filterdList = await dao.getPostListWithIds({
      userids: followingList,
    });
    dao.release();
    if (!filterdList) {
      return httpInternalServerErrorResponse(res);
    }

    const regex = /^[0-9]+$/;
    if (cursor && regex.test(cursor)) {
      const findIndex = filterdList.findIndex(
        (p) => p.postid === parseInt(cursor)
      );
      if (findIndex > -1) {
        filterdList.splice(0, findIndex + 1);
      }
    }

    const prevLength = filterdList.length;
    filterdList.splice(pageSize);

    return httpSuccessResponse(res, {
      data: filterdList,
      nextCursor:
        prevLength > pageSize ? filterdList.at(-1)?.postid : undefined,
    });
  }
);

// "GET /api/posts/likes"
// 좋아요를 한 게시글 조회
apiPostsRouter.get(
  '/likes',
  async (
    req: TypedRequestQuery<{ cursor?: string }>,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor } = req.query;
    const { 'connect.sid': token } = req.cookies;
    const pageSize = 10;
    if (!token) return httpUnAuthorizedResponse(res);

    const findUser = await decodingUserToken(token);
    if (!findUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpNotFoundResponse(res);
    }

    const dao = new DAO();
    let postList = await dao.getPostList({});
    if (!postList) {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }
    let likeList = (await dao.getLikeList({ userid: findUser.id }))?.map(
      (l) => l.postid
    );
    dao.release();
    if (!likeList) {
      return httpInternalServerErrorResponse(res);
    }

    postList = postList.filter((p) => likeList.includes(p.postid));

    const regex = /^[0-9]+$/;
    if (cursor && regex.test(cursor)) {
      const findIndex = postList.findIndex((p) => p.postid === ~~cursor);
      postList.splice(0, findIndex + 1);
    }

    const prevLength = postList.length;
    postList.splice(pageSize);

    return httpSuccessResponse(res, {
      data: postList,
      nextCursor: prevLength > pageSize ? postList.at(-1)?.postid : undefined,
    });
  }
);

// "GET /api/posts/bookmarks"
// 북마크한 게시글 조회
apiPostsRouter.get(
  '/bookmarks',
  async (
    req: TypedRequestQuery<{ cursor?: string }>,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    await delay(1000);
    const cursor = req.query.cursor;
    const { 'connect.sid': token } = req.cookies;
    const pageSize = 10;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    let postList = await dao.getBookmarkPostList({ userid: currentUser.id });
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

    const isOver = postList.length > pageSize;
    if (isOver) {
      postList.splice(pageSize);
    }

    return httpSuccessResponse(res, {
      data: postList,
      nextCursor: isOver ? postList.at(-1)?.postid : undefined,
    });
  }
);

// "GET /api/posts/:id"
// 특정 게시글 조회
apiPostsRouter.get(
  '/:id',
  async (
    req: TypedRequestQueryParams<{ userid?: string }, { id?: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const { userid } = req.query;
    const { id } = req.params;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id) || !userid) return httpBadRequestResponse(res);

    const dao = new DAO();
    const findPost = await dao.getPost({ userid: userid, postid: ~~id });
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    return httpSuccessResponse(res, { data: findPost });
  }
);

// "DELETE /api/posts/:id"
// 특정 게시글 삭제
apiPostsRouter.delete(
  '/:id',
  async (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ message: string }>
  ) => {
    const { id } = req.params;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getPost({
      userid: currentUser.id,
      postid: ~~id,
    });
    if (!findPost) {
      dao.release();
      return httpNotFoundResponse(res, 'Post not found');
    }

    const repostList = await dao.getPostList({
      originalid: findPost.postid,
      quote: false,
    });
    if (repostList && repostList.length !== 0) {
      await dao.deletePost({ postids: repostList.map((p) => p.postid) });
    }

    await dao.deletePost({ postid: findPost.postid });
    dao.release();
    if (findPost.images.length) {
      findPost.images.forEach((image) => {
        try {
          const imagePath = path.join(uploadPath, '/', image.link);
          fs.removeSync(imagePath);
        } catch (error) {
          console.error(error);
        }
      });
    }

    return httpNoContentRepsonse(res);
  }
);

// "POST /api/posts/:id/hearts"
// 특정 게시글 좋아요
apiPostsRouter.post(
  '/:id/hearts',
  async (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const { id } = req.params;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~id });
    if (!findPost) {
      dao.release();
      return httpNotFoundResponse(res, 'Post not found');
    }

    const isHeart = !!findPost.Hearts.find((u) => u.id === currentUser.id);
    if (isHeart) {
      dao.release();
      return httpForbiddenResponse(res, 'This post is already liked.');
    }

    const updatedPost = await dao.reactionHandler({
      method: 'post',
      type: 'Heart',
      postid: findPost.postid,
      userid: currentUser.id,
    });
    dao.release();

    return httpCreatedResponse(res, { data: updatedPost });
  }
);

// "DELETE /api/posts/:id/hearts"
// 특정 게시글 좋아요 취소
apiPostsRouter.delete(
  '/:id/hearts',
  async (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const { id } = req.params;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~id });
    if (!findPost) {
      dao.release();
      return httpNotFoundResponse(res, 'Post not found');
    }

    const isHeart = !!findPost.Hearts.find((u) => u.id === currentUser.id);
    if (!isHeart) {
      dao.release();
      return httpForbiddenResponse(res, 'This post is already unliked.');
    }

    const updatedPost = await dao.reactionHandler({
      method: 'delete',
      type: 'Heart',
      postid: findPost.postid,
      userid: currentUser.id,
    });
    dao.release();

    return httpSuccessResponse(res, { data: updatedPost });
  }
);

// "POST /api/posts/:id/reposts"
// 특정 게시글 리포스트
apiPostsRouter.post(
  '/:id/reposts',
  async (
    req: TypedRequestQueryParams<{ quote?: string }, { id?: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~id });
    if (!findPost) {
      dao.release();
      return httpNotFoundResponse(res, 'Post not found');
    }

    const isRepost = !!findPost.Reposts.find((u) => u.id === currentUser.id);
    if (isRepost) {
      dao.release();
      return httpForbiddenResponse(res, 'This post has been reposted.');
    }

    await dao.reactionHandler({
      method: 'post',
      type: 'Repost',
      postid: findPost.postid,
      userid: currentUser.id,
    });

    const newRepost = await dao.createPost({
      userid: currentUser.id,
      content: '',
      originalid: findPost.postid,
    });
    dao.release();

    return httpCreatedResponse(res, { data: newRepost });
  }
);

// "DELETE /api/posts/:id/reposts"
// 특정 게시글 리포스트 취소
apiPostsRouter.delete(
  '/:id/reposts',
  async (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ message: string }>
  ) => {
    const { id } = req.params;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getRepostPost({
      originalid: ~~id,
      userid: currentUser.id,
      quote: false,
    });
    if (!findPost || !findPost.originalid) {
      dao.release();
      return httpNotFoundResponse(res, 'Post not found');
    }

    await dao.reactionHandler({
      method: 'delete',
      type: 'Repost',
      postid: findPost.originalid,
      userid: currentUser.id,
    });
    await dao.deletePost({ postid: findPost.postid });
    dao.release();

    return httpNoContentRepsonse(res);
  }
);

// "GET /api/posts/:id/comments"
// 특정 게시글 댓글 조회
apiPostsRouter.get(
  '/:id/comments',
  async (
    req: TypedRequestQueryParams<
      { cursor?: string; userid?: string },
      { id?: string }
    >,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor, userid } = req.query;
    const { id } = req.params;
    const pageSize = 10;
    if (!id || !REGEX_NUMBER_ONLY.test(id) || !userid) {
      return httpBadRequestResponse(res);
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ userid, postid: ~~id });
    if (!findPost) {
      dao.release();
      return httpNotFoundResponse(res, 'Post not found');
    }

    const commentList = await dao.getPostList({ parentid: findPost.postid });
    dao.release();
    if (!commentList) {
      return httpInternalServerErrorResponse(res);
    }

    if (cursor && REGEX_NUMBER_ONLY.test(cursor)) {
      const findIndex = commentList.findIndex(
        (p) => p.postid === parseInt(cursor)
      );
      if (findIndex > -1) {
        commentList.splice(0, findIndex + 1);
      }
    }

    const prevLength = commentList.length;
    commentList.splice(pageSize);

    return httpSuccessResponse(res, {
      data: commentList,
      nextCursor:
        prevLength > pageSize ? commentList.at(-1)?.postid : undefined,
    });
  }
);

// "POST /api/posts/:id/comments"
// 특정 게시글 댓글 달기
apiPostsRouter.post(
  '/:id/comments',
  upload.array('images', 4),
  async (
    req: TypedRequestBodyParams<
      { content?: string; mediaInfo?: string },
      { id?: string }
    >,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    await delay(3000);
    const { id } = req.params;
    const { content, mediaInfo } = req.body;
    const files = req.files;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]*$/;
    const media = mediaInfo
      ? (JSON.parse(mediaInfo) as (GifType | ImageType)[])
      : undefined;

    if (!id || !regex.test(id) || !files) {
      removingFiles(files);
      return httpBadRequestResponse(res);
    }
    if (!content && files.length === 0 && !media)
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      removingFiles(files);
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~id });
    if (!findPost) {
      dao.release();
      removingFiles(files);
      return httpNotFoundResponse(res, 'Post not found');
    }

    const newComment = await dao.createPost({
      userid: currentUser.id,
      content,
      files,
      media,
      parentid: findPost.postid,
    });
    await dao.reactionHandler({
      method: 'post',
      type: 'Comment',
      userid: currentUser.id,
      postid: findPost.postid,
      commentid: newComment?.postid,
    });
    dao.release();

    return httpCreatedResponse(res, { data: newComment });
  }
);

// "GET /api/posts/:id/views"
// 특정 게시물 view 조회
apiPostsRouter.get(
  '/:id/views',
  async (
    req: TypedRequestParams<{ id: string }>,
    res: TypedResponse<{ data?: Views; message: string }>
  ) => {
    const id = req.params.id;
    const regex = /^[0-9]+$/;
    const { 'connect.sid': token } = req.cookies;
    if (!regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~id });
    if (!findPost) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    if (findPost.userid !== currentUser.id) {
      dao.release();
      return httpForbiddenResponse(res);
    }

    let findView = await dao.getView({ postid: ~~id });
    if (findView) {
      dao.release();
      return httpSuccessResponse(res, { data: findView });
    }

    await dao.viewsHandler({ postid: findPost.postid, create: true });
    findView = await dao.getView({ postid: findPost.postid });
    dao.release();

    return httpSuccessResponse(res, { data: findView });
  }
);

// "POST /api/posts/:id/views"
// 특정 게시물 view 카운트 추가
apiPostsRouter.post(
  '/:id/views',
  async (
    req: TypedRequestBodyParams<
      { userid?: string; type?: string },
      { id: string }
    >,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const id = req.params.id;
    const { userid, type = '' } = req.body;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]+$/;
    if (!userid || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~id, userid });
    if (!findPost) {
      dao.release();
      return httpNotFoundResponse(res, 'Post not found');
    }

    const isViews = (type: string): type is keyof Omit<Views, 'postid'> => {
      return [
        'impressions',
        'engagements',
        'detailExpands',
        'newFollowers',
        'profileVisit',
      ].includes(type);
    };
    const key = isViews(type) ? type : 'impressions';

    const updatedPost = await dao.viewsHandler({
      key,
      postid: ~~id,
    });
    dao.release();

    return httpCreatedResponse(res, { data: updatedPost });
  }
);

// "POST /api/posts/:id/bookmarks"
// 특정 게시물 bookmark 추가
apiPostsRouter.post(
  '/:id/bookmarks',
  async (
    req: TypedRequestParams<{ id: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const id = req.params.id;
    const regex = /^[0-9]+$/;
    const { 'connect.sid': token } = req.cookies;
    if (!regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~id });
    if (!findPost) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    const isBookmark = findPost.Bookmarks.some((u) => u.id === currentUser.id);
    if (isBookmark) {
      dao.release();
      return httpForbiddenResponse(res, 'Already bookmarked');
    }

    const updatedPost = await dao.reactionHandler({
      type: 'Bookmark',
      method: 'post',
      userid: currentUser.id,
      postid: ~~id,
    });
    dao.release();

    return httpCreatedResponse(res, { data: updatedPost });
  }
);

// "DELETE /api/posts/:id/bookmarks"
// 특정 게시물 bookmark 제거
apiPostsRouter.delete(
  '/:id/bookmarks',
  async (
    req: TypedRequestParams<{ id: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]+$/;
    if (!regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~id });
    if (!findPost) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    const isBookmark = findPost.Bookmarks.some((u) => u.id === currentUser.id);
    if (!isBookmark) {
      dao.release();
      return httpForbiddenResponse(res, 'Not already bookmarked');
    }

    const updatedPost = await dao.reactionHandler({
      type: 'Bookmark',
      method: 'delete',
      userid: currentUser.id,
      postid: ~~id,
    });
    dao.release();
    return httpSuccessResponse(res, { data: updatedPost });
  }
);

// "GET /api/posts/:id/engagements"
// 특정 게시물 engagements 조회
apiPostsRouter.get(
  '/:id/engagements',
  async (
    req: TypedRequestQueryParams<
      { userid?: string; cursor?: string; filter?: string },
      { id: string }
    >,
    res: TypedResponse<{
      data?: AdvancedPost[] | AdvancedUser[];
      nextCursor?: number | string;
      message: string;
    }>
  ) => {
    await delay(1000);
    const { userid, filter, cursor } = req.query;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    const pageSize = 10;
    if (
      !userid ||
      !REGEX_NUMBER_ONLY.test(id) ||
      (filter !== 'quotes' && filter !== 'retweets' && filter !== 'likes')
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
    const findPost = await dao.getPost({ userid, postid: ~~id });
    if (!findPost) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    switch (filter) {
      case 'quotes': {
        const postList = await dao.getPostList({
          originalid: findPost.postid,
          quote: true,
        });
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
        const isOver = postList.length > pageSize;
        if (isOver) {
          postList.splice(pageSize);
        }

        return httpSuccessResponse(res, {
          data: postList,
          nextCursor: isOver ? postList.at(-1)?.postid : undefined,
        });
      }
      case 'retweets': {
        const repostList = (
          await dao.getReactionList({ type: 'Repost', postid: ~~id })
        )?.map((r) => r.userid);
        if (!repostList) {
          dao.release();
          return httpInternalServerErrorResponse(res);
        }
        if (repostList.length === 0) {
          dao.release();
          return httpSuccessResponse(res, { data: [] });
        }

        const userList = await dao.getUserListWithIds({ userids: repostList });
        dao.release();
        if (!userList) {
          return httpInternalServerErrorResponse(res);
        }

        if (cursor && REGEX_NUMBER_ONLY.test(cursor)) {
          const findIndex = userList.findIndex((u) => u.id === cursor);
          if (findIndex > -1) {
            userList.splice(0, findIndex + 1);
          }
        }
        const isOver = userList.length > pageSize;
        if (isOver) {
          userList.splice(pageSize);
        }

        return httpSuccessResponse(res, {
          data: userList,
          nextCursor: isOver ? userList.at(-1)?.id : undefined,
        });
      }
      case 'likes': {
        const likeList = (await dao.getLikeList({ postid: ~~id }))?.map(
          (r) => r.userid
        );
        if (!likeList) {
          dao.release();
          return httpInternalServerErrorResponse(res);
        }
        if (likeList.length === 0) {
          dao.release();
          return httpSuccessResponse(res, { data: [] });
        }

        const userList = await dao.getUserListWithIds({ userids: likeList });
        dao.release();
        if (!userList) {
          return httpInternalServerErrorResponse(res);
        }

        if (cursor && REGEX_NUMBER_ONLY.test(cursor)) {
          const findIndex = userList.findIndex((u) => u.id === cursor);
          if (findIndex > -1) {
            userList.splice(0, findIndex + 1);
          }
        }
        const isOver = userList.length > pageSize;
        if (isOver) {
          userList.splice(pageSize);
        }

        return httpSuccessResponse(res, {
          data: userList,
          nextCursor: isOver ? userList.at(-1)?.id : undefined,
        });
      }
      default:
        return httpBadRequestResponse(res);
    }
  }
);

// "POST /api/posts/:id/pinned"
// 특정 게시물 pinned 추가
apiPostsRouter.post(
  '/:id/pinned',
  async (
    req: TypedRequestParams<{ id: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
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
    const findPost = await dao.getPost({
      userid: currentUser.id,
      postid: ~~id,
    });
    if (!findPost) {
      dao.release();
      return httpNotFoundResponse(res, 'post not found');
    }
    if (findPost.pinned) {
      dao.release();
      return httpForbiddenResponse(res, 'already pinned');
    }

    const updatedPost = await dao.updatePost({
      userid: currentUser.id,
      postid: ~~id,
      pinned: true,
    });
    dao.release();

    return httpSuccessResponse(res, { data: updatedPost });
  }
);

// "DELETE /api/posts/:id/pinned"
// 특정 게시물 pinned 추가
apiPostsRouter.delete(
  '/:id/pinned',
  async (
    req: TypedRequestParams<{ id: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
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
    const findPost = await dao.getPost({
      userid: currentUser.id,
      postid: ~~id,
    });
    if (!findPost) {
      dao.release();
      return httpNotFoundResponse(res, 'post not found');
    }
    if (!findPost.pinned) {
      dao.release();
      return httpForbiddenResponse(res, 'already unPinned');
    }

    const updatedPost = await dao.updatePost({
      userid: currentUser.id,
      postid: ~~id,
      pinned: false,
    });
    dao.release();

    return httpSuccessResponse(res, { data: updatedPost });
  }
);

// "POST /api/posts/:id/scope"
// 특정 게시물 scope 설정
apiPostsRouter.post(
  '/:id/scope',
  async (
    req: TypedRequestBodyParams<{ scope?: string }, { id: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const { scope } = req.body;
    const id = req.params.id;
    const { 'connect.sid': token } = req.cookies;
    if (
      !REGEX_NUMBER_ONLY.test(id) ||
      typeof scope === 'undefined' ||
      (scope !== 'every' &&
        scope !== 'follow' &&
        scope !== 'verified' &&
        scope !== 'only')
    )
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findPost = await dao.getPost({
      userid: currentUser.id,
      postid: ~~id,
    });
    if (!findPost) {
      dao.release();
      return httpNotFoundResponse(res);
    }

    if (findPost.scope === scope) {
      dao.release();
      return httpForbiddenResponse(res, 'already set up');
    }

    const updatedPost = await dao.updatePost({
      userid: currentUser.id,
      postid: ~~id,
      scope,
    });
    dao.release();
    return httpSuccessResponse(res, { data: updatedPost });
  }
);

// "GET /api/posts/:id/photos/:imagesId"
// 특정 게시글 이미지 조회
apiPostsRouter.get(
  '/:id/photos/:imageId',
  async (
    req: TypedRequestParams<{ id?: string; imageId?: string }>,
    res: TypedResponse<{ data?: PostImage; message: string }>
  ) => {
    const { id, imageId } = req.params;
    const regex = /^[0-9]*$/;
    if (!id || !imageId || !regex.test(id) || !regex.test(imageId)) {
      return httpBadRequestResponse(res);
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~id });
    dao.release();
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    const image = findPost.images.find(
      (image) => image.imageId === parseInt(imageId)
    );
    if (!image) {
      return httpNotFoundResponse(res, 'Image not found');
    }

    return httpSuccessResponse(res, { data: image });
  }
);

export default apiPostsRouter;
