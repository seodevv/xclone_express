import jwt from 'jsonwebtoken';
import { AdvancedUser, SafeUser, User } from '../model/User';
import DAO from './DAO';

export const generateUserToken = (user: AdvancedUser) => {
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

export const decodingUserToken = (token: string) => {
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
