import express, { Request, Response } from 'express';
import {
  httpForbiddenResponse,
  httpSuccessResponse,
  httpUnAuthorizedResponse,
} from '../../lib/responsesHandlers';
import { decodingUserToken } from '../../lib/common';
import DAO from '@/lib/DAO';

const apiHashtagsRouter = express.Router();

// "GET /api/hashtags/trends"
// 상위 트랜드 조회
apiHashtagsRouter.get('/trends', (req: Request, res: Response) => {
  const { ['connect.sid']: token } = req.cookies;
  if (!token) return httpUnAuthorizedResponse(res);

  const currentUser = decodingUserToken(token);
  if (!currentUser) {
    res.clearCookie('connect.sid');
    return httpForbiddenResponse(res, 'The token has expired');
  }

  const dao = new DAO();
  const tagList = dao.getTagList();
  tagList.sort((a, b) => (a.count > b.count ? -1 : 1));
  tagList.splice(10);

  return httpSuccessResponse(res, tagList);
});

export default apiHashtagsRouter;
