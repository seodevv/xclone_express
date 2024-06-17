import jwt from 'jsonwebtoken';
import multer from 'multer';
import DAO from './DAO';
import { uploadPath } from '@/app';
import { AdvancedUser, SafeUser } from '@/model/User';

export const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const fileName = `${Date.now()}_${file.originalname}`;
    cb(null, fileName);
  },
});

export const generateUserToken = (user: AdvancedUser): string | undefined => {
  try {
    const secret = process.env.JWT_SECRET || 'secret';
    const options: jwt.SignOptions = {};
    const token = jwt.sign(
      { id: user.id, nickname: user.nickname, image: user.image },
      secret,
      options
    );

    return token;
  } catch (err) {
    console.error(err);
    return;
  }
};

export const decodingUserToken = (token: string): AdvancedUser | undefined => {
  try {
    const secret = process.env.JWT_SECRET || 'secret';
    const options: jwt.VerifyOptions = {};
    const decode = jwt.verify(token, secret, options) as SafeUser;

    const dao = new DAO();
    const user = dao.getUser(decode.id);

    return user;
  } catch (error) {
    console.error(error);
    return;
  }
};
