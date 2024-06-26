import express from 'express';
import multer from 'multer';
import fs from 'fs-extra';
import path from 'path';
import {
  httpBadRequestResponse,
  httpCreatedResponse,
  httpForbiddenResponse,
  httpNoContentRepsonse,
  httpNotFoundResponse,
  httpSuccessResponse,
  httpUnAuthorizedResponse,
} from '@/lib/responsesHandlers';
import { decodingUserToken, storage } from '@/lib/common';
import DAO from '@/lib/DAO';
import {
  TypedRequestBody,
  TypedRequestBodyParams,
  TypedRequestParams,
  TypedRequestQuery,
  TypedRequestQueryParams,
} from '@/model/Request';
import { TypedResponse } from '@/model/Response';
import { AdvancedPost } from '@/model/Post';
import { PostImage } from '@/model/PostImage';
import { uploadPath } from '@/app';

const apiPostsRouter = express.Router();
const upload = multer({ storage });

// "GET /api/posts"
// 검색 결과 페이지 조회
apiPostsRouter.get(
  '/',
  (
    req: TypedRequestQuery<{
      cursor?: string;
      q?: string;
      pf?: string;
      f?: string;
    }>,
    res: TypedResponse<{ data?: AdvancedPost[]; message: string }>
  ) => {
    const { cursor = '', q = '', pf = '', f = '' } = req.query;
    const { ['connect.sid']: token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    let searchList = dao.getPostList({});
    const regex = /^[0-9]*$/;
    if (cursor && regex.test(cursor)) {
      searchList = searchList.filter((p) => p.postId < parseInt(cursor));
    }

    if (q && q.trim()) {
      searchList = searchList.filter((p) => {
        const regex = new RegExp(`${q.toLowerCase()}`);
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

    searchList.sort((a, b) => (a.createAt > b.createAt ? -1 : 1));
    searchList.splice(10);

    return httpSuccessResponse(res, searchList);
  }
);

// "POST /api/posts"
// 게시물 생성
apiPostsRouter.post(
  '/',
  upload.array('images', 4),
  (
    req: TypedRequestBody<{ content?: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const { content } = req.body;
    const files = req.files;
    const { ['connect.sid']: token } = req.cookies;
    if (!content || !files) {
      files &&
        Object.values(files).forEach((v: Express.Multer.File) => {
          fs.removeSync(uploadPath + '/' + v.filename);
        });
      return httpBadRequestResponse(res);
    }
    if (!token) {
      Object.values(files).forEach((v: Express.Multer.File) => {
        fs.removeSync(uploadPath + '/' + v.filename);
      });
      return httpUnAuthorizedResponse(res);
    }

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      Object.values(files).forEach((v: Express.Multer.File) => {
        fs.removeSync(uploadPath + '/' + v.filename);
      });
      res.clearCookie('connect.sid');
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const newPost = dao.createPost({ userId: currentUser.id, content, files });

    return httpCreatedResponse(res, newPost);
  }
);

// "GET /api/posts/recommends"
// 추천 게시글 조회
apiPostsRouter.get(
  '/recommends',
  (
    req: TypedRequestQuery<{ cursor?: string }>,
    res: TypedResponse<{ data?: AdvancedPost[]; message: string }>
  ) => {
    const { cursor = '' } = req.query;

    const dao = new DAO();
    let recommendsList = dao.getPostList({});
    recommendsList.sort((a, b) => {
      if (a._count.Hearts > b._count.Hearts) {
        return -1;
      } else if (a._count.Hearts === b._count.Hearts) {
        if (a.createAt > b.createAt) return -1;
        return 1;
      }
      return 1;
    });

    if (cursor && !Number.isNaN(parseInt(cursor))) {
      const findIndex = recommendsList.findIndex(
        (p) => p.postId === parseInt(cursor)
      );
      recommendsList.splice(0, findIndex + 1);
    }
    recommendsList.splice(10);

    return httpSuccessResponse(res, recommendsList);
  }
);

// "GET /api/posts/followings"
// 팔로잉 게시글 조회
apiPostsRouter.get(
  '/followings',
  (
    req: TypedRequestQuery<{ cursor?: string }>,
    res: TypedResponse<{ data?: AdvancedPost[]; message: string }>
  ) => {
    const { cursor = '' } = req.query;
    const { ['connect.sid']: token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const followingList = dao
      .getFollowList({ source: currentUser.id })
      .map((f) => f.target);

    const filterdList = dao.getPostList({ followIds: followingList });
    filterdList.sort((a, b) => (a.createAt > b.createAt ? -1 : 1));

    if (cursor && !Number.isNaN(parseInt(cursor))) {
      const findIndex = filterdList.findIndex(
        (p) => p.postId === parseInt(cursor)
      );
      filterdList.splice(0, findIndex + 1);
    }

    filterdList.splice(10);

    return httpSuccessResponse(res, filterdList);
  }
);

// "GET /api/posts/:id"
// 특정 게시글 조회
apiPostsRouter.get(
  '/:id',
  (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const { id } = req.params;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);

    const dao = new DAO();
    const findPost = dao.getFullPost(parseInt(id));
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    return httpSuccessResponse(res, findPost);
  }
);

// "DELETE /api/posts/:id"
// 특정 게시글 삭제
apiPostsRouter.delete(
  '/:id',
  (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ message: string }>
  ) => {
    const { id } = req.params;
    const { ['connect.sid']: token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = dao.getFullPost(parseInt(id));
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    const isOwner = findPost.User.id === currentUser.id;
    if (!isOwner) {
      return httpForbiddenResponse(res, 'Permission deny');
    }

    if (findPost.images.length) {
      try {
        findPost.images.forEach((image) => {
          const imagePath = path.join(uploadPath, '/', image.link);
          fs.removeSync(imagePath);
        });
      } catch (error) {
        console.error(error);
      }
    }
    dao.deletePost(findPost.postId);

    return httpNoContentRepsonse(res);
  }
);

// "POST /api/posts/:id/heart"
// 특정 게시글 좋아요
apiPostsRouter.post(
  '/:id/heart',
  (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const { id } = req.params;
    const { ['connect.sid']: token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = dao.getPost(parseInt(id));
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    const isHeart = !!findPost.Hearts.find((u) => u.id === currentUser.id);
    if (isHeart) {
      return httpForbiddenResponse(res, 'This post is already liked.');
    }

    const updatedPost = dao.reactionHandler({
      method: 'post',
      type: 'Heart',
      postId: findPost.postId,
      userId: currentUser.id,
    });

    return httpCreatedResponse(res, updatedPost);
  }
);

// "DELETE /api/posts/:id/heart"
// 특정 게시글 좋아요 취소
apiPostsRouter.delete(
  '/:id/heart',
  (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const { id } = req.params;
    const { ['connect.sid']: token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = dao.getPost(parseInt(id));
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    const isHeart = !!findPost.Hearts.find((u) => u.id === currentUser.id);
    if (!isHeart) {
      return httpForbiddenResponse(res, 'This post is already unliked.');
    }

    const updatedPost = dao.reactionHandler({
      method: 'delete',
      type: 'Heart',
      postId: findPost.postId,
      userId: currentUser.id,
    });

    return httpSuccessResponse(res, updatedPost);
  }
);

// "POST /api/posts/:id/reposts"
// 특정 게시글 리포스트
apiPostsRouter.post(
  '/:id/reposts',
  (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const { id } = req.params;
    const { ['connect.sid']: token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = dao.getFullPost(parseInt(id));
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    const isRepost = !!findPost.Reposts.find((u) => u.id === currentUser.id);
    if (isRepost) {
      return httpForbiddenResponse(res, 'This post has been reposted.');
    }

    dao.reactionHandler({
      method: 'post',
      type: 'Repost',
      postId: findPost.postId,
      userId: currentUser.id,
    });

    const newRepost = dao.createPost({
      userId: currentUser.id,
      content: 'reposts',
      originalId: findPost.postId,
    });

    return httpCreatedResponse(res, newRepost);
  }
);

// "DELETE /api/posts/:id/reposts"
// 특정 게시글 리포스트 취소
apiPostsRouter.delete(
  '/:id/reposts',
  (
    req: TypedRequestParams<{ id?: string }>,
    res: TypedResponse<{ message: string }>
  ) => {
    const { id } = req.params;
    const { ['connect.sid']: token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = dao.getRepostPost({
      originalId: parseInt(id),
      userId: currentUser.id,
    });
    if (!findPost || !findPost.originalId) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    dao.reactionHandler({
      method: 'delete',
      type: 'Repost',
      postId: findPost.originalId,
      userId: currentUser.id,
    });
    dao.deletePost(findPost.postId);

    return httpNoContentRepsonse(res);
  }
);

// "GET /api/posts/:id/comments"
// 특정 게시글 댓글 조회
apiPostsRouter.get(
  '/:id/comments',
  (
    req: TypedRequestQueryParams<{ cursor?: string }, { id?: string }>,
    res: TypedResponse<{ data?: AdvancedPost[]; message: string }>
  ) => {
    const { cursor = '' } = req.query;
    const { id } = req.params;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);

    const dao = new DAO();
    const findPost = dao.getPost(parseInt(id));
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    const commentList = dao.getPostList({ parentId: findPost.postId });
    commentList.sort((a, b) => (a.createAt > b.createAt ? 1 : -1));

    if (cursor && regex.test(cursor)) {
      const findIndex = commentList.findIndex(
        (p) => p.postId === parseInt(cursor)
      );
      if (findIndex >= 0) {
        commentList.splice(0, findIndex + 1);
      }
    }
    commentList.splice(10);

    return httpSuccessResponse(res, commentList);
  }
);

// "POST /api/posts/:id/comments"
// 특정 게시글 댓글 달기
apiPostsRouter.post(
  '/:id/comments',
  upload.array('images', 4),
  (
    req: TypedRequestBodyParams<{ content?: string }, { id?: string }>,
    res: TypedResponse<{ data?: AdvancedPost; message: string }>
  ) => {
    const { id } = req.params;
    const { content } = req.body;
    const files = req.files;
    const { ['connect.sid']: token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !content || !files || !regex.test(id)) {
      files &&
        Object.values(files).forEach((v: Express.Multer.File) => {
          fs.removeSync(uploadPath + '/' + v.filename);
        });
      return httpBadRequestResponse(res);
    }
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      Object.values(files).forEach((v: Express.Multer.File) => {
        fs.removeSync(uploadPath + '/' + v.filename);
      });
      res.clearCookie('connect.sid');
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = dao.getPost(parseInt(id));
    if (!findPost) {
      Object.values(files).forEach((v: Express.Multer.File) => {
        fs.removeSync(uploadPath + '/' + v.filename);
      });
      return httpNotFoundResponse(res, 'Post not found');
    }

    dao.reactionHandler({
      method: 'post',
      type: 'Comment',
      postId: findPost.postId,
      userId: currentUser.id,
    });
    const newComment = dao.createPost({
      userId: currentUser.id,
      content,
      files,
      parentId: findPost.postId,
    });

    return httpCreatedResponse(res, newComment);
  }
);

// "GET /api/posts/:id/photos/:imagesId"
// 특정 게시글 이미지 조회
apiPostsRouter.get(
  '/:id/photos/:imageId',
  (
    req: TypedRequestParams<{ id?: string; imageId?: string }>,
    res: TypedResponse<{ data?: PostImage; message: string }>
  ) => {
    const { id, imageId } = req.params;
    const regex = /^[0-9]*$/;
    if (!id || !imageId || !regex.test(id) || !regex.test(imageId)) {
      return httpBadRequestResponse(res);
    }

    const dao = new DAO();
    const findPost = dao.getPost(parseInt(id));
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    const image = findPost.images.find(
      (image) => image.imageId === parseInt(imageId)
    );
    if (!image) {
      return httpNotFoundResponse(res, 'Image not found');
    }

    return httpSuccessResponse(res, image);
  }
);

export default apiPostsRouter;
