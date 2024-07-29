import express from 'express';
import {
  httpSuccessResponse,
  httpUnAuthorizedResponse,
} from '@/lib/responsesHandlers';
import { decodingUserToken } from '@/lib/common';
import DAO from '@/lib/DAO';
import { TypedRequestCookies } from '@/model/Request';
import { TypedResponse } from '@/model/Response';
import { Tags } from '@/model/Hashtag';

const apiHashtagsRouter = express.Router();

// "GET /api/hashtags/trends"
// 상위 트랜드 조회
apiHashtagsRouter.get(
  '/trends',
  (
    req: TypedRequestCookies,
    res: TypedResponse<{ data?: Tags[]; message: string }>
  ) => {
    const { ['connect.sid']: token } = req.cookies;
    if (!token) return httpUnAuthorizedResponse(res);

    const currentUser = decodingUserToken(token);
    if (!currentUser) {
      res.clearCookie('connect.sid');
      return httpUnAuthorizedResponse(res, 'The token has expired');
    }

    const dao = new DAO();
    const tagList = dao.getTagList();
    tagList.splice(10);

    return httpSuccessResponse(res, { data: tagList });
  }
);

export default apiHashtagsRouter;
