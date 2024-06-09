import jwt from 'jsonwebtoken';
import { User } from '../model/User';
import DAO from './DAO';

export const generateUserToken = (user: User) => {
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
    return null;
  }
};

export const decodingUserToken = (token: string): User | null => {
  let user: User | null = null;
  const secret = process.env.JWT_SECRET || 'secret';
  const options: jwt.VerifyOptions = {};
  const callback: jwt.VerifyCallback = (error, decoded) => {
    if (error) {
      console.error(error);
      return;
    }
    const { id } = decoded as User;
    const userInfo = new DAO().findUser(id);
    user = userInfo ? userInfo : null;
  };
  jwt.verify(token, secret, options, callback);

  return user;
};
