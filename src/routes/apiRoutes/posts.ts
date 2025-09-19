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
  COOKIE_CLEAR_OPTIONS,
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
import { PostImage, Schemas } from '@/db/schema';
import DAO from '@/lib/DAO';

const apiPostsRouter = express.Router();
const upload = multer({ storage });

// "GET /api/posts"
// 검색 결과 페이지 조회
// ㅇ
apiPostsRouter.get(
  '/',
  async (
    req: TypedRequestQuery<{
      cursor?: string;
      size?: string;
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
    const { cursor = '0', size = '10', q, pf, lf, f } = req.query;
    const { 'connect.sid': token } = req.cookies;
    const pageSize = ~~size !== 0 ? ~~size : f === 'media' ? 12 : 10;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const followingIds =
      pf === 'on'
        ? (await dao.getFollowList({ source: currentUser.id }))?.map(
            (f) => f.target
          )
        : undefined;
    const postList = await dao.getPostList({
      userids: followingIds,
      q,
      filter: f === 'media' ? 'media' : undefined,
      sort: !f ? 'Hearts' : 'createat',
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

// "POST /api/posts"
// 게시물 생성
// ㅇ
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
    if (typeof currentUser === 'undefined') {
      removingFiles(files);
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    if (typeof repostid !== 'undefined') {
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
// ㅇ
apiPostsRouter.get(
  '/recommends',
  async (
    req: TypedRequestQuery<{ cursor?: string; size?: string; filter?: string }>,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    await delay(1000);
    const { cursor = '0', size = '10', filter = 'all' } = req.query;
    const pageSize = ~~size !== 0 ? ~~size : 10;

    const dao = new DAO();
    const postList = await dao.getPostList({
      filter: filter === 'media' ? 'media' : 'all',
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

// "GET /api/posts/followings"
// 팔로잉 게시글 조회
// ㅇ
apiPostsRouter.get(
  '/followings',
  async (
    req: TypedRequestQuery<{ cursor?: string; size?: string }>,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor = '0', size = '10' } = req.query;
    const { 'connect.sid': token } = req.cookies;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const followingIds = (
      await dao.getFollowList({ source: currentUser.id })
    )?.map((f) => f.target);
    if (typeof followingIds === 'undefined') {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }

    const postList = await dao.getPostList({
      userids: followingIds,
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

// "GET /api/posts/likes"
// 좋아요를 한 게시글 조회
// ㅇ
apiPostsRouter.get(
  '/likes',
  async (
    req: TypedRequestQuery<{ cursor?: string; size?: string }>,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor = '0', size = '10' } = req.query;
    const { 'connect.sid': token } = req.cookies;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    if (!token) return httpUnAuthorizedResponse(res);

    const findUser = await decodingUserToken(token);
    if (typeof findUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpNotFoundResponse(res);
    }

    const dao = new DAO();
    const likePostIds = (await dao.getLikeList({ userid: findUser.id }))?.map(
      (post) => post.postid
    );
    if (typeof likePostIds === 'undefined') {
      dao.release();
      return httpInternalServerErrorResponse(res);
    }

    const postList = await dao.getPostList({
      postids: likePostIds,
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

// "GET /api/posts/bookmarks"
// 북마크한 게시글 조회
// ㅇ
apiPostsRouter.get(
  '/bookmarks',
  async (
    req: TypedRequestQuery<{ cursor?: string; size?: string }>,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    await delay(1000);
    const { cursor = '0', size = '10' } = req.query;
    const { 'connect.sid': token } = req.cookies;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const postList = await dao.getBookmarkPostList({
      userid: currentUser.id,
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

// "GET /api/posts/:postid"
// 특정 게시글 조회
// ㅇ
apiPostsRouter.get(
  '/:postid',
  async (
    req: TypedRequestQueryParams<{ userid?: string }, { postid: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const userid = req.query.userid;
    const postid = req.params.postid;
    const regex = /^[0-9]*$/;
    if (!regex.test(postid) || !userid) {
      return httpBadRequestResponse(res);
    }

    const dao = new DAO();
    const post = await dao.getPost({ userid: userid, postid: ~~postid });
    dao.release();
    if (typeof post === 'undefined') {
      return httpNotFoundResponse(res, 'Post not found');
    }

    return httpSuccessResponse(res, { data: post });
  }
);

// "DELETE /api/posts/:postid"
// 특정 게시글 삭제
// ㅇ
apiPostsRouter.delete(
  '/:postid',
  async (
    req: TypedRequestParams<{ postid: string }>,
    res: TypedResponse<{ message: string }>
  ) => {
    const postid = req.params.postid;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!regex.test(postid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getPost({
      userid: currentUser.id,
      postid: ~~postid,
    });
    if (typeof findPost === 'undefined') {
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

// "POST /api/posts/:postid/hearts"
// 특정 게시글 좋아요
// ㅇ
apiPostsRouter.post(
  '/:postid/hearts',
  async (
    req: TypedRequestParams<{ postid: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const postid = req.params.postid;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!regex.test(postid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getPost({
      postid: ~~postid,
    });
    if (typeof findPost === 'undefined') {
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

// "DELETE /api/posts/:postid/hearts"
// 특정 게시글 좋아요 취소
// ㅇ
apiPostsRouter.delete(
  '/:postid/hearts',
  async (
    req: TypedRequestParams<{ postid: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const postid = req.params.postid;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!regex.test(postid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~postid });
    if (typeof findPost === 'undefined') {
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

// "POST /api/posts/:postid/reposts"
// 특정 게시글 리포스트
// ㅇ
apiPostsRouter.post(
  '/:postid/reposts',
  async (
    req: TypedRequestQueryParams<{ quote?: string }, { postid: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const postid = req.params.postid;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!regex.test(postid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~postid });
    if (typeof findPost === 'undefined') {
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

// "DELETE /api/posts/:postid/reposts"
// 특정 게시글 리포스트 취소
// ㅇ
apiPostsRouter.delete(
  '/:postid/reposts',
  async (
    req: TypedRequestParams<{ postid: string }>,
    res: TypedResponse<{ message: string }>
  ) => {
    const postid = req.params.postid;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!regex.test(postid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getRepostPost({
      originalid: ~~postid,
      userid: currentUser.id,
      quote: false,
    });
    if (typeof findPost === 'undefined' || !findPost.originalid) {
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

// "GET /api/posts/:postid/comments"
// 특정 게시글 댓글 조회
// ㅇ
apiPostsRouter.get(
  '/:postid/comments',
  async (
    req: TypedRequestQueryParams<
      { cursor?: string; size?: string; userid?: string },
      { postid: string }
    >,
    res: TypedResponse<{
      data?: AdvancedPost[];
      nextCursor?: number;
      message: string;
    }>
  ) => {
    const { cursor = '0', size = '10', userid } = req.query;
    const postid = req.params.postid;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    if (!REGEX_NUMBER_ONLY.test(postid) || !userid) {
      return httpBadRequestResponse(res);
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ userid, postid: ~~postid });
    if (typeof findPost === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res, 'Post not found');
    }

    const commentList = await dao.getPostList({
      parentid: findPost.postid,
      pagination: {
        limit: pageSize,
        offset: ~~cursor,
      },
    });
    dao.release();
    if (typeof commentList === 'undefined') {
      return httpInternalServerErrorResponse(res);
    }

    return httpSuccessResponse(res, {
      data: commentList,
      nextCursor: commentList.length === pageSize ? ~~cursor + 1 : undefined,
    });
  }
);

// "POST /api/posts/:postidid/comments"
// 특정 게시글 댓글 달기
// ㅇ
apiPostsRouter.post(
  '/:postid/comments',
  upload.array('images', 4),
  async (
    req: TypedRequestBodyParams<
      { content?: string; mediaInfo?: string },
      { postid: string }
    >,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    await delay(3000);
    const postid = req.params.postid;
    const { content, mediaInfo } = req.body;
    const files = req.files;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]*$/;
    const media = mediaInfo
      ? (JSON.parse(mediaInfo) as (GifType | ImageType)[])
      : undefined;

    if (!regex.test(postid) || !files) {
      removingFiles(files);
      return httpBadRequestResponse(res);
    }
    if (!content && files.length === 0 && !media) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      removingFiles(files);
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~postid });
    if (typeof findPost === 'undefined') {
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

// "GET /api/posts/:postid/views"
// 특정 게시물 view 조회
// ㅇ
apiPostsRouter.get(
  '/:postid/views',
  async (
    req: TypedRequestParams<{ postid: string }>,
    res: TypedResponse<{ data?: Views; message: string }>
  ) => {
    const postid = req.params.postid;
    const regex = /^[0-9]+$/;
    const { 'connect.sid': token } = req.cookies;
    if (!regex.test(postid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~postid });
    if (typeof findPost === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res);
    }

    if (findPost.userid !== currentUser.id) {
      dao.release();
      return httpForbiddenResponse(res);
    }

    let findView = await dao.getView({ postid: ~~postid });
    if (typeof findView === 'undefined') {
      await dao.viewsHandler({ postid: findPost.postid, create: true });
    }
    findView = await dao.getView({ postid: findPost.postid });
    dao.release();

    return httpSuccessResponse(res, { data: findView });
  }
);

// "POST /api/posts/:postid/views"
// 특정 게시물 view 카운트 추가
// ㅇ
apiPostsRouter.post(
  '/:postid/views',
  async (
    req: TypedRequestBodyParams<
      { userid?: string; type?: string },
      { postid: string }
    >,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const postid = req.params.postid;
    const { userid, type = 'impressions' } = req.body;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]+$/;

    if (!userid || !regex.test(postid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);
    if (
      type !== 'impressions' &&
      type !== 'engagements' &&
      type !== 'detailexpands' &&
      type !== 'newfollowers' &&
      type !== 'profilevisit'
    ) {
      return httpBadRequestResponse(res);
    }

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~postid, userid });
    if (typeof findPost === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res, 'Post not found');
    }

    const updatedPost = await dao.viewsHandler({
      key: type,
      postid: ~~postid,
    });
    dao.release();

    return httpCreatedResponse(res, { data: updatedPost });
  }
);

// "POST /api/posts/:postid/bookmarks"
// 특정 게시물 bookmark 추가
apiPostsRouter.post(
  '/:postid/bookmarks',
  async (
    req: TypedRequestParams<{ postid: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const postid = req.params.postid;
    const regex = /^[0-9]+$/;
    const { 'connect.sid': token } = req.cookies;
    if (!regex.test(postid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~postid });
    if (typeof findPost === 'undefined') {
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
      postid: ~~postid,
    });
    dao.release();

    return httpCreatedResponse(res, { data: updatedPost });
  }
);

// "DELETE /api/posts/:postid/bookmarks"
// 특정 게시물 bookmark 제거
// ㅇ
apiPostsRouter.delete(
  '/:postid/bookmarks',
  async (
    req: TypedRequestParams<{ postid: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const postid = req.params.postid;
    const { 'connect.sid': token } = req.cookies;
    const regex = /^[0-9]+$/;
    if (!regex.test(postid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~postid });
    if (typeof findPost === 'undefined') {
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
      postid: ~~postid,
    });
    dao.release();
    return httpSuccessResponse(res, { data: updatedPost });
  }
);

// "GET /api/posts/:postid/engagements"
// 특정 게시물 engagements 조회
// ㅇ
apiPostsRouter.get(
  '/:postid/engagements',
  async (
    req: TypedRequestQueryParams<
      { cursor?: string; size?: string; userid?: string; filter?: string },
      { postid: string }
    >,
    res: TypedResponse<{
      data?: AdvancedPost[] | AdvancedUser[];
      nextCursor?: number | string;
      message: string;
    }>
  ) => {
    await delay(1000);
    const postid = req.params.postid;
    const { cursor = '0', size = '10', userid, filter } = req.query;
    const { 'connect.sid': token } = req.cookies;
    const pageSize = ~~size !== 0 ? ~~size : 10;
    if (
      !userid ||
      !REGEX_NUMBER_ONLY.test(postid) ||
      (filter !== 'quotes' && filter !== 'retweets' && filter !== 'likes')
    ) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ userid, postid: ~~postid });
    if (typeof findPost === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res, 'The post not found');
    }

    switch (filter) {
      case 'quotes': {
        const postList = await dao.getPostList({
          originalid: findPost.postid,
          quote: true,
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
      case 'retweets': {
        const repostList = await dao.getReactionList({
          type: 'Repost',
          postid: ~~postid,
        });
        if (typeof repostList === 'undefined') {
          dao.release();
          return httpInternalServerErrorResponse(res);
        }

        const userList = await dao.getUserListWithIds({
          userids: repostList.map((r) => r.userid),
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
      case 'likes': {
        const likeList = await dao.getLikeList({ postid: ~~postid });
        if (typeof likeList === 'undefined') {
          dao.release();
          return httpInternalServerErrorResponse(res);
        }

        const userList = await dao.getUserListWithIds({
          userids: likeList.map((r) => r.userid),
          pagination: {
            limit: pageSize,
            offset: ~~cursor,
          },
        });
        dao.release();
        if (!userList) {
          return httpInternalServerErrorResponse(res);
        }

        return httpSuccessResponse(res, {
          data: userList,
          nextCursor: userList.length === pageSize ? ~~cursor + 1 : undefined,
        });
      }
      default:
        return httpBadRequestResponse(res);
    }
  }
);

// "POST /api/posts/:postid/pinned"
// 특정 게시물 pinned 추가
// ㅇ
apiPostsRouter.post(
  '/:postid/pinned',
  async (
    req: TypedRequestParams<{ postid: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const postid = req.params.postid;
    const { 'connect.sid': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(postid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findPost = await dao.getPost({
      userid: currentUser.id,
      postid: ~~postid,
    });
    if (typeof findPost === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res, 'post not found');
    }
    if (findPost.pinned) {
      dao.release();
      return httpForbiddenResponse(res, 'already pinned');
    }

    const updatedPost = await dao.updatePost({
      userid: currentUser.id,
      postid: ~~postid,
      pinned: true,
    });
    dao.release();

    return httpSuccessResponse(res, { data: updatedPost });
  }
);

// "DELETE /api/posts/:postid/pinned"
// 특정 게시물 pinned 추가
// ㅇ
apiPostsRouter.delete(
  '/:postid/pinned',
  async (
    req: TypedRequestParams<{ postid: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const postid = req.params.postid;
    const { 'connect.sid': token } = req.cookies;
    if (!REGEX_NUMBER_ONLY.test(postid)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findPost = await dao.getPost({
      userid: currentUser.id,
      postid: ~~postid,
    });
    if (typeof findPost === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res, 'post not found');
    }
    if (!findPost.pinned) {
      dao.release();
      return httpForbiddenResponse(res, 'already unPinned');
    }

    const updatedPost = await dao.updatePost({
      userid: currentUser.id,
      postid: ~~postid,
      pinned: false,
    });
    dao.release();

    return httpSuccessResponse(res, { data: updatedPost });
  }
);

// "POST /api/posts/:postid/scope"
// 특정 게시물 scope 설정
// ㅇ
apiPostsRouter.post(
  '/:postid/scope',
  async (
    req: TypedRequestBodyParams<{ scope?: string }, { postid: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const postid = req.params.postid;
    const { scope } = req.body;
    const { 'connect.sid': token } = req.cookies;
    if (
      !REGEX_NUMBER_ONLY.test(postid) ||
      typeof scope === 'undefined' ||
      (scope !== 'every' &&
        scope !== 'follow' &&
        scope !== 'verified' &&
        scope !== 'only')
    ) {
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findPost = await dao.getPost({
      userid: currentUser.id,
      postid: ~~postid,
    });
    if (typeof findPost === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res);
    }

    if (findPost.scope === scope) {
      dao.release();
      return httpForbiddenResponse(res, 'already set up');
    }

    const updatedPost = await dao.updatePost({
      userid: currentUser.id,
      postid: ~~postid,
      scope,
    });
    dao.release();
    return httpSuccessResponse(res, { data: updatedPost });
  }
);

// "GET /api/posts/:postid/photos/:imagesId"
// 특정 게시글 이미지 조회
// ㅇ
apiPostsRouter.get(
  '/:postid/photos/:imageId',
  async (
    req: TypedRequestParams<{ postid: string; imageId: string }>,
    res: TypedResponse<{ data?: PostImage; message: string }>
  ) => {
    const { postid, imageId } = req.params;
    const regex = /^[0-9]*$/;
    if (!regex.test(postid) || !regex.test(imageId)) {
      return httpBadRequestResponse(res);
    }

    const dao = new DAO();
    const findPost = await dao.getPost({ postid: ~~postid });
    dao.release();
    if (typeof findPost === 'undefined') {
      return httpNotFoundResponse(res, 'Post not found');
    }

    const image = findPost.images.find(
      (image) => image.imageId === parseInt(imageId)
    );
    if (typeof image === 'undefined') {
      return httpNotFoundResponse(res, 'Image not found');
    }

    return httpSuccessResponse(res, { data: image });
  }
);

export default apiPostsRouter;
