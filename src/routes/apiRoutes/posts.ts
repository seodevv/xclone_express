import express, { Request, Response } from 'express';
import multer from 'multer';
import {
  httpBadRequestResponse,
  httpCreatedResponse,
  httpForbiddenResponse,
  httpNoContentRepsonse,
  httpNotFoundResponse,
  httpSuccessResponse,
  httpUnAuthorizedResponse,
} from '@/lib/responsesHandlers';
import { uploadPath } from '@/index';
import { decodingUserToken } from '@/lib/common';
import DAO from '@/lib/DAO';

const apiPostsRouter = express.Router();
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const fileName = `${Date.now()}_${file.originalname}`;
    cb(null, fileName);
  },
});
const upload = multer({ storage });

// "GET /api/posts"
// 검색 결과 페이지 조회
apiPostsRouter.get(
  '/',
  (
    req: Request<
      Object,
      Object,
      Object,
      { cursor: string; q: string; pf: string; f: string }
    >,
    res: Response
  ) => {
    const { cursor = '', q = '', pf = '', f = '' } = req.query;
    const { ['connect.sid']: token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpForbiddenResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    let searchList = dao.getPostList();
    const regex = /^[0-9]*$/;
    if (cursor && regex.test(cursor)) {
      searchList = searchList.filter((p) => p.postId < parseInt(cursor));
    }

    if (q && q.trim()) {
      searchList = searchList.filter((p) => {
        const regex = new RegExp(`${q.toLowerCase()}`);
        if (
          regex.test(p.content.toLowerCase()) ||
          regex.test(p.User.id.toLowerCase()) ||
          regex.test(p.User.nickname.toLowerCase())
        ) {
          return true;
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
    req: Request<Object, Object, { content: string | undefined }>,
    res: Response
  ) => {
    const { content } = req.body;
    const files = req.files;
    const { ['connect.sid']: token } = req.cookies;
    if (!content || !files) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpForbiddenResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const newPost = dao.createPost({ user: currentUser, content, files });

    return httpCreatedResponse(res, newPost);
  }
);

// "GET /api/posts/recommends"
// 추천 게시글 조회
apiPostsRouter.get(
  '/recommends',
  (req: Request<Object, Object, Object, { cursor: string }>, res: Response) => {
    const { cursor = '' } = req.query;

    const dao = new DAO();
    let recommendsList = dao.getPostList();
    recommendsList.sort((a, b) => {
      if (!a._count || !b._count) {
        if (a.createAt > b.createAt) return -1;
        return 1;
      }

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
    req: Request<Object, Object, Object, { cursor: string | undefined }>,
    res: Response
  ) => {
    const { cursor = '' } = req.query;
    const { ['connect.sid']: token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpForbiddenResponse(res);
    }

    const dao = new DAO();
    const followingList = dao
      .getUserList()
      .filter((u) => u.Followers?.some((f) => f.id === currentUser.id))
      .map((u) => u.id);

    const filterdList = dao
      .getPostList()
      .filter((p) => followingList.includes(p.User.id));
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
  (req: Request<{ id: string | undefined }>, res: Response) => {
    const { id } = req.params;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);

    const dao = new DAO();
    const findPost = dao.findPost({ id });
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
  (req: Request<{ id: string | undefined }>, res: Response) => {
    const { id } = req.params;
    const { ['connect.sid']: token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpForbiddenResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = dao.findPost({ id });
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    const isOwner = findPost.User.id === currentUser.id;
    if (!isOwner) {
      return httpUnAuthorizedResponse(res, 'Permission deny');
    }

    dao.deletePost(findPost.postId);

    return httpNoContentRepsonse(res);
  }
);

// "POST /api/posts/:id/heart"
// 특정 게시글 좋아요
apiPostsRouter.post(
  '/:id/heart',
  (req: Request<{ id: string | undefined }>, res: Response) => {
    const { id } = req.params;
    const { ['connect.sid']: token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpForbiddenResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = dao.findPost({ id });
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    const isHeart = !!findPost.Hearts.find((u) => u.id === currentUser.id);
    if (isHeart) {
      return httpForbiddenResponse(res, 'This post is already liked.');
    }

    const updatedPost = dao.updatePost({
      postId: findPost.postId,
      Hearts: [...findPost.Hearts, { id: currentUser.id }],
      _count: findPost._count
        ? { ...findPost._count, Hearts: findPost._count.Hearts + 1 }
        : { Hearts: 1, Reposts: 0, Comments: 0 },
    });

    return httpCreatedResponse(res, updatedPost);
  }
);

// "DELETE /api/posts/:id/heart"
// 특정 게시글 좋아요 취소
apiPostsRouter.delete(
  '/:id/heart',
  (req: Request<{ id: string | undefined }>, res: Response) => {
    const { id } = req.params;
    const { ['connect.sid']: token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpForbiddenResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = dao.findPost({ id });
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    const isHeart = !!findPost.Hearts.find((u) => u.id === currentUser.id);
    if (!isHeart) {
      return httpForbiddenResponse(res, 'This post is already unliked.');
    }

    const updatedPost = dao.updatePost({
      postId: findPost.postId,
      Hearts: findPost.Hearts.filter((u) => u.id !== currentUser.id),
      _count: findPost._count
        ? {
            ...findPost._count,
            Hearts:
              findPost._count.Hearts !== 0 ? findPost._count.Hearts - 1 : 0,
          }
        : { Hearts: 0, Reposts: 0, Comments: 0 },
    });

    return httpSuccessResponse(res, updatedPost);
  }
);

// "POST /api/posts/:id/reposts"
// 특정 게시글 리포스트
apiPostsRouter.post(
  '/:id/reposts',
  (req: Request<{ id: string | undefined }>, res: Response) => {
    const { id } = req.params;
    const { ['connect.sid']: token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpForbiddenResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = dao.findPost({ id });
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    const isRepost = !!dao
      .getPostList()
      .find(
        (p) =>
          p.Original?.postId ===
            (findPost.Original ? findPost.Original.postId : findPost.postId) &&
          p.User.id === currentUser.id
      );
    if (isRepost) {
      return httpForbiddenResponse(res, 'This post has already been reposted.');
    }

    const updatedPost = dao.updatePost({
      postId: findPost.postId,
      Reposts: [...findPost.Reposts, { id: currentUser.id }],
      _count: findPost._count
        ? { ...findPost._count, Reposts: findPost._count.Reposts + 1 }
        : { Hearts: 0, Reposts: 1, Comments: 0 },
    });

    const newRepost = dao.createPost({
      user: currentUser,
      content: 'reposts',
      Original: updatedPost
        ? updatedPost.Original
          ? updatedPost.Original
          : updatedPost
        : findPost,
    });

    return httpCreatedResponse(res, newRepost);
  }
);

// "DELETE /api/posts/:id/reposts"
// 특정 게시글 리포스트 취소
apiPostsRouter.delete(
  '/:id/reposts',
  (req: Request<{ id: string | undefined }>, res: Response) => {
    const { id } = req.params;
    const { ['connect.sid']: token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpForbiddenResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = dao.findPost({ id, repostUserId: currentUser.id });
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    dao.deletePost(findPost.postId);

    const originalPost = dao.findPost({ id });
    if (originalPost) {
      dao.updatePost({
        postId: originalPost.postId,
        Reposts: originalPost.Reposts.filter((u) => u.id !== currentUser.id),
        _count: originalPost._count
          ? {
              ...originalPost._count,
              Reposts:
                originalPost._count.Reposts !== 0
                  ? originalPost._count.Reposts - 1
                  : 0,
            }
          : {
              Hearts: 0,
              Reposts: 0,
              Comments: 0,
            },
      });
    }

    return httpNoContentRepsonse(res);
  }
);

// "GET /api/posts/:id/comments"
// 특정 게시글 댓글 조회
apiPostsRouter.get(
  '/:id/comments',
  (
    req: Request<
      { id: string | undefined },
      Object,
      Object,
      { cursor: string | undefined }
    >,
    res: Response
  ) => {
    const { id } = req.params;
    const { cursor = '' } = req.query;
    const regex = /^[0-9]*$/;
    if (!id || !regex.test(id)) return httpBadRequestResponse(res);

    const dao = new DAO();
    const findPost = dao.findPost({ id });
    if (!findPost) {
      return httpNotFoundResponse(res);
    }

    const commentList = dao
      .getPostList()
      .filter((p) => p.Parent?.postId === findPost.postId);
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
    req: Request<{ id: string }, Object, { content: string | undefined }>,
    res: Response
  ) => {
    const { id } = req.params;
    const { content } = req.body;
    const files = req.files;
    const { ['connect.sid']: token } = req.cookies;
    const regex = /^[0-9]*$/;
    if (!id || !content || !files || !regex.test(id))
      return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpForbiddenResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const findPost = dao.findPost({ id });
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }
    const newPost = dao.createPost({
      user: currentUser,
      content,
      files,
      Parent: {
        postId: findPost.postId,
        User: findPost.User,
        images: findPost.Images,
      },
    });

    return httpCreatedResponse(res, newPost);
  }
);

// "GET /api/posts/:id/photos/:imagesId"
// 특정 게시글 이미지 조회
apiPostsRouter.get(
  '/:id/photos/:imageId',
  (
    req: Request<{ id: string | undefined; imageId: string | undefined }>,
    res: Response
  ) => {
    const { id, imageId } = req.params;
    const regex = /^[0-9]*$/;
    if (!id || !imageId || !regex.test(id) || !regex.test(imageId)) {
      return httpBadRequestResponse(res);
    }

    const dao = new DAO();
    const findPost = dao.findPost({ id });
    if (!findPost) {
      return httpNotFoundResponse(res, 'Post not found');
    }

    const image = findPost.Images.find(
      (image) => image.imageId === parseInt(imageId)
    );
    if (!image) {
      return httpNotFoundResponse(res, 'Image not found');
    }

    return httpSuccessResponse(res, image);
  }
);

export default apiPostsRouter;
