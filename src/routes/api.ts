import express from 'express';
import multer from 'multer';
import fs from 'fs-extra';
import path from 'path';
import apiPostsRouter from './apiRoutes/posts';
import apiUsersRouter from './apiRoutes/users';
import apiHashtagsRouter from './apiRoutes/hashtags';
import apiListsRouter from '@/routes/apiRoutes/lists';
import {
  httpBadRequestResponse,
  httpForbiddenResponse,
  httpInternalServerErrorResponse,
  httpNotFoundResponse,
  httpSuccessResponse,
  httpUnAuthorizedResponse,
} from '@/lib/responsesHandlers';
import { uploadPath } from '@/app';
import {
  COOKIE_CLEAR_OPTIONS,
  COOKIE_OPTIONS,
  decodingUserToken,
  delay,
  encodingString,
  generateUserToken,
} from '@/lib/common';
import {
  TypedRequestBody,
  TypedRequestCookies,
  TypedRequestParams,
  TypedRequestQuery,
} from '@/model/Request';
import { TypedResponse } from '@/model/Response';
import { AdvancedUser } from '@/model/User';
import DAO from '@/lib/DAO';
import apiRoomsRouter from '@/routes/apiRoutes/rooms';
import apiMessagesRouter from '@/routes/apiRoutes/messages';
import jwt from 'jsonwebtoken';

const apiRouter = express.Router();

apiRouter.use('/users', apiUsersRouter);
apiRouter.use('/posts', apiPostsRouter);
apiRouter.use('/hashtags', apiHashtagsRouter);
apiRouter.use('/lists', apiListsRouter);
apiRouter.use('/rooms', apiRoomsRouter);
apiRouter.use('/messages', apiMessagesRouter);

// "GET" /api/login"
// 로그인 아이디 확인
apiRouter.get(
  '/login',
  async (
    req: TypedRequestQuery<{
      type?: string;
      id?: string;
      nickname?: string;
    }>,
    res: TypedResponse<{ message: string }>
  ) => {
    await delay(1000);
    const { type = 'login', id, nickname } = req.query;
    if (!id) return httpBadRequestResponse(res);

    const dao = new DAO();
    const findUser = await dao.getUser({ id, nickname });
    dao.release();

    switch (type) {
      case 'login':
        return findUser
          ? httpSuccessResponse(res, { message: 'ok' })
          : httpNotFoundResponse(res);
      case 'signup':
        return !findUser
          ? httpSuccessResponse(res, { message: 'ok' })
          : httpForbiddenResponse(res, findUser.id === id ? 'id' : 'nickname');
      default:
        return httpBadRequestResponse(res);
    }
  }
);

// "POST /api/login"
// 로그인
apiRouter.post(
  '/login',
  multer().none(),
  async (
    req: TypedRequestBody<{ id?: string; password?: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    await delay(1000);
    const { id, password } = req.body;
    // body 가 없을 시
    if (!id || !password) return httpBadRequestResponse(res);

    const dao = new DAO();
    const findUser = await dao.getUser({ id, password });
    dao.release();

    // 로그인 성공 시
    if (typeof findUser !== 'undefined') {
      const userToken = generateUserToken(findUser);
      if (typeof userToken === 'undefined') {
        return httpInternalServerErrorResponse(res);
      }
      // res.cookie('connect.sid', userToken, COOKIE_OPTIONS);
      // res.cookie('connect.sid', userToken, {
      //   maxAge: 1000 * 60 * 60 * 24 * 30,
      //   httpOnly: true,
      //   path: '/',
      //   sameSite: 'none',
      //   secure: true,
      // });
      const cookieString = `connect.sid=${userToken}; Max-Age=2592000; HttpOnly; Path=/; Secure; SameSite=None;`;
      res.setHeader('Set-Cookie', cookieString);
      return httpSuccessResponse(res, { data: findUser });
    }

    // 로그인 실패 시
    return httpForbiddenResponse(res, 'ID, Password is incorrect.');
  }
);

// "GET /api/login/token"
// 토근 생성
apiRouter.get(
  '/login/token',
  async (
    req: TypedRequestQuery<{ id?: string; password?: string }>,
    res: TypedResponse<{ data?: string; message: string }>
  ) => {
    const { id, password } = req.query;
    if (!id || !password) return httpBadRequestResponse(res);

    const secret = process.env.JWT_SECRET || 'secret';
    const dao = new DAO();
    const user = await dao.getUser({ id, password });
    if (typeof user === 'undefined') {
      return httpForbiddenResponse(res);
    }

    try {
      const token = jwt.sign({ id, password }, secret);
      return httpSuccessResponse(res, { data: token });
    } catch (error) {
      console.error(error);
      return httpInternalServerErrorResponse(res);
    }
  }
);

// "Post /api/login/token"
// 토근을 이용한 로그인
apiRouter.post(
  '/login/token',
  multer().none(),
  async (
    req: TypedRequestBody<{ token?: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { token } = req.body;
    if (!token) return httpBadRequestResponse(res);

    const secret = process.env.JWT_SECRET || 'secret';
    try {
      const decode = jwt.verify(token, secret);

      if (
        typeof decode === 'string' ||
        !['id', 'password'].every((key) => key in decode)
      ) {
        return httpBadRequestResponse(res);
      }

      const { id, password } = decode as { id: string; password: string };

      const dao = new DAO();
      const user = await dao.getUser({ id, password });
      dao.release();

      if (typeof user === 'undefined') {
        return httpForbiddenResponse(res, 'the token is incorrect');
      }

      const userToken = generateUserToken(user);
      if (typeof userToken === 'undefined') {
        return httpInternalServerErrorResponse(res);
      }
      res.cookie('connect.sid', userToken, COOKIE_OPTIONS);
      return httpSuccessResponse(res, { data: user });
    } catch (error) {
      console.error(error);
      return httpBadRequestResponse(res);
    }
  }
);

// "POST /api/login/oauth"
// OAuth 로그인
apiRouter.post(
  '/login/oauth',
  multer().none(),
  async (
    req: TypedRequestBody<{ id?: string; nickname?: string; image?: string }>,
    res: TypedResponse<{ message: string }>
  ) => {
    const { id, nickname, image } = req.body;
    if (!id || !nickname || !image) return httpBadRequestResponse(res);

    const dao = new DAO();
    let user = await dao.getUser({ id });
    if (!user) {
      user = await dao.createUser({
        id,
        password: encodingString(id) as string,
        nickname,
        image,
        birth: null,
      });
      if (!user) {
        dao.release();
        return httpInternalServerErrorResponse(res);
      }
    }
    dao.release();

    const userToken = generateUserToken(user);
    if (!userToken) {
      return httpInternalServerErrorResponse(res);
    }

    res.cookie('connect.sid', userToken, COOKIE_OPTIONS);
    return httpSuccessResponse(res, { data: user });
  }
);

// "POST /api/logout"
// 로그아웃
apiRouter.post(
  '/logout',
  (req: TypedRequestCookies, res: TypedResponse<{ message: string }>) => {
    // res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
    // res.clearCookie('connect.sid', COOKIE_CLEAR_OPTIONS);
    const cookieString = `connect.sid=; Max-Age=0; HttpOnly; Path=/; Secure; SameSite=None;`;
    res.setHeader('Set-Cookie', cookieString);
    return httpSuccessResponse(res, { message: 'Logout successful' });
  }
);

// "POST /api/confirm"
// 패스워드 체크
apiRouter.post(
  '/confirm',
  async (
    req: TypedRequestBody<{ password?: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    await delay(1000);
    const password = req.body.password;
    const { 'connect.sid': token } = req.cookies;
    if (!password) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (typeof currentUser === 'undefined') {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const user = await dao.getUser({ id: currentUser.id, password });
    dao.release();

    if (typeof user === 'undefined') {
      return httpNotFoundResponse(res, 'User not found');
    }

    return httpSuccessResponse(res, { data: user });
  }
);

// "POST /api/password"
// 패스워드 변경
apiRouter.post(
  '/password',
  async (
    req: TypedRequestBody<{ current?: string; newPassword?: string }>,
    res: TypedResponse<{ data?: AdvancedUser; message: string }>
  ) => {
    const { current, newPassword } = req.body;
    const { 'connect.sid': token } = req.cookies;
    if (!current || !newPassword) return httpBadRequestResponse(res);
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = await decodingUserToken(token);
    if (!currentUser) {
      res.cookie('connect.sid', '', COOKIE_CLEAR_OPTIONS);
      return httpUnAuthorizedResponse(res);
    }

    const dao = new DAO();
    const findUser = await dao.getUser({
      id: currentUser.id,
      password: current,
    });
    if (typeof findUser === 'undefined') {
      dao.release();
      return httpNotFoundResponse(res);
    }

    const updatedUser = await dao.updatePassword({
      id: currentUser.id,
      password: newPassword,
    });
    dao.release();
    return httpSuccessResponse(res, { data: updatedUser });
  }
);

// "GET /api/image/:imageName"
// 이미지 호스팅
apiRouter.get(
  '/image/:imageName',
  (
    req: TypedRequestParams<{ imageName?: string }>,
    res: TypedResponse<{ message: string }>
  ) => {
    const { imageName } = req.params;
    if (!imageName) return httpBadRequestResponse(res);

    const imagePath = path.resolve(uploadPath, imageName);
    if (fs.existsSync(imagePath)) {
      return res.status(200).sendFile(imagePath);
    }

    return httpNotFoundResponse(res, 'Image file not found.');
  }
);

export default apiRouter;
