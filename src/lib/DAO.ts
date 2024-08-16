import path from 'path';
import fs from 'fs-extra';
import userData from '@/data/user.json';
import postData from '@/data/post.json';
import tagData from '@/data/hashtag.json';
import roomData from '@/data/room.json';
import messageData from '@/data/message.json';
import followData from '@/data/follow.json';
import reactionsData from '@/data/reaction.json';
import viewsData from '@/data/views.json';
import { AdvancedUser, isVerified, SafeUser, User } from '@/model/User';
import { AdvancedPost, GifType, ImageType, Post } from '@/model/Post';
import { PostImage } from '@/model/PostImage';
import { Follow } from '@/model/Follow';
import { Reactions } from '@/model/Reaction';
import { isTag, isWord, Tag, Tags, Word } from '@/model/Hashtag';
import { AdvancedRoom, Room } from '@/model/Room';
import { Message } from '@/model/Message';
import { Morpheme } from '@/model/Morpheme';
import { Views } from '@/model/Views';

let instance: DAO | null;

class DAO {
  private userList: User[] = [];
  private postList: Post[] = [];
  private tagList: Tags[] = [];
  private roomList: Room[] = [];
  private messageList: Message[] = [];
  private followList: Follow[] = [];
  private reactionList: Reactions[] = [];
  private viewList: Views[] = [];

  constructor() {
    if (instance) {
      return instance;
    }

    console.time('Data Load');
    this.userList.push(
      ...userData.data.map((u) => ({
        ...u,
        verified: u.verified ? isVerified(u.verified) : undefined,
        regist: new Date(u.regist),
      }))
    );
    this.postList.push(
      ...postData.data.map((p) => ({
        ...p,
        createAt: new Date(p.createAt),
      }))
    );
    this.tagList.push(
      ...tagData.data.map((t) => {
        if (isWord(t)) return t;
        return isTag(t);
      })
    );
    this.roomList.push(
      ...roomData.data.map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt),
        lastAt: r.lastAt ? new Date(r.lastAt) : undefined,
      }))
    );
    this.messageList.push(
      ...messageData.data.map((m) => ({
        ...m,
        createdAt: new Date(m.createdAt),
      }))
    );
    this.followList.push(
      ...followData.data.map((f) => ({ ...f, createAt: new Date(f.createAt) }))
    );
    this.reactionList.push(...reactionsData.data);
    this.viewList.push(...viewsData.data);
    instance = this;
    console.timeEnd('Data Load');
  }

  getUserList(): AdvancedUser[] {
    const userList: AdvancedUser[] = this.userList.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      image: u.image,
      banner: u.banner,
      desc: u.desc,
      refer: u.refer,
      regist: u.regist,
      verified: u.verified,
      Followers: this.getFollowList({ target: u.id }).map((f) => ({
        id: f.source,
      })),
      _count: {
        Followers: this.getFollowList({ target: u.id }).length,
        Followings: this.getFollowList({ source: u.id }).length,
      },
    }));
    return userList;
  }

  getPostList({
    userId,
    parentId,
    followIds,
  }: {
    userId?: User['id'];
    parentId?: Post['postId'];
    followIds?: User['id'][];
  }): AdvancedPost[] {
    const postList: AdvancedPost[] = [];
    this.postList.forEach((p) => {
      const post = this.getFullPost({ postId: p.postId });
      if (!post) return;
      if (userId && post.userId !== userId) return;
      if (parentId && post.parentId !== parentId) return;
      if (followIds && !followIds.includes(post.User.id)) return;

      postList.push(post);
    });

    return postList;
  }

  getTagList(): Tags[] {
    const tagList = [
      ...this.tagList.sort((a, b) => (a.count > b.count ? -1 : 1)),
    ];
    return tagList;
  }

  getRoomList(userId: User['id']): AdvancedRoom[] {
    const roomList: AdvancedRoom[] = [];
    this.roomList.forEach((r) => {
      if (r.receiverId !== userId && r.senderId !== userId) return;
      const Receiver = this.getSafeUser(r.receiverId);
      const Sender = this.getSafeUser(r.senderId);
      if (!Receiver || !Sender) return;
      roomList.push({
        ...r,
        Receiver,
        Sender,
      });
    });
    return roomList;
  }

  getMessageList(room: Room['room']): Message[] {
    return this.messageList
      .filter((m) => m.room === room)
      .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
  }

  getFollowList({
    source,
    target,
  }: {
    source?: User['id'];
    target?: User['id'];
  }): Follow[] {
    if (!source && !target) return [...this.followList];
    if (source && target)
      return this.followList.filter(
        (f) => f.source === source && f.target === target
      );
    return this.followList.filter(
      (f) => f.source === source || f.target === target
    );
  }

  getLikeList({ userId }: { userId: User['id'] }): Reactions[] {
    return this.reactionList.filter(
      (r) => r.type === 'Heart' && r.userId === userId
    );
  }

  getUser({
    id,
    password,
    nickname,
  }: {
    id: User['id'];
    password?: User['password'];
    nickname?: User['nickname'];
  }): AdvancedUser | undefined {
    let findUser: User | undefined;
    if (password) {
      findUser = this.userList.find(
        (u) =>
          u.id.toLowerCase() === id.toLowerCase() && u.password === password
      );
    } else {
      findUser = this.userList.find(
        (u) =>
          u.id.toLowerCase() === id.toLowerCase() ||
          u.nickname.toLowerCase() === nickname?.toLowerCase()
      );
    }

    if (findUser) {
      const advancedUser: AdvancedUser = {
        id: findUser.id,
        nickname: findUser.nickname,
        image: findUser.image,
        banner: findUser.banner,
        desc: findUser.desc,
        refer: findUser.refer,
        regist: findUser.regist,
        verified: findUser.verified,
        Followers: this.followList
          .filter((f) => f.target === findUser.id)
          .map((u) => ({ id: u.source })),
        _count: {
          Followers: this.followList.filter((f) => f.target === findUser.id)
            .length,
          Followings: this.followList.filter((f) => f.source === findUser.id)
            .length,
        },
      };
      return advancedUser;
    }
    return;
  }

  getSafeUser(id: User['id']): SafeUser | undefined {
    const advancedUser = this.getUser({ id });
    if (advancedUser) {
      return {
        id: advancedUser.id,
        image: advancedUser.image,
        nickname: advancedUser.nickname,
      };
    }
    return;
  }

  getPost({
    userId,
    postId,
  }: {
    userId?: string;
    postId: number;
  }): AdvancedPost | undefined {
    const findPost = this.postList.find((p) => {
      if (userId) {
        return p.postId === postId && p.userId === userId;
      }
      return p.postId === postId;
    });
    if (!findPost) return;

    const user = this.getSafeUser(findPost.userId);
    if (!user) return;

    const Hearts = this.reactionList
      .filter((r) => r.type === 'Heart' && r.postId === findPost.postId)
      .map((r) => ({ id: r.userId }));
    const Reposts = this.reactionList
      .filter((r) => r.type === 'Repost' && r.postId === findPost.postId)
      .map((r) => ({ id: r.userId }));
    const totalComments = this.reactionList
      .filter((r) => r.type === 'Comment' && r.postId === findPost.postId)
      .map((r) => ({ id: r.userId }));
    const Comments = [...new Set(totalComments.map((v) => v.id))].map((v) => ({
      id: v,
    }));
    const Bookmarks = this.reactionList
      .filter((r) => r.type === 'Bookmark' && r.postId === findPost.postId)
      .map((r) => ({ id: r.userId }));
    const Views = this.getView({ postId })?.impressions || 0;

    const advancedPost: AdvancedPost = {
      ...findPost,
      User: user,
      Hearts,
      Reposts,
      Comments,
      Bookmarks,
      _count: {
        Hearts: Hearts.length,
        Reposts: Reposts.length,
        Comments: totalComments.length,
        Views,
      },
    };

    return advancedPost;
  }

  getRepostPost({
    originalId,
    userId,
  }: {
    originalId: Post['postId'];
    userId: User['id'];
  }): Post | undefined {
    const findPost = this.postList.find(
      (p) => p.originalId === originalId && p.userId === userId
    );
    return findPost;
  }

  getFullPost({
    userId,
    postId,
  }: {
    userId?: string;
    postId: number;
  }): AdvancedPost | undefined {
    const findPost = this.getPost({ userId: userId, postId: postId });
    if (!findPost) return;

    if (findPost.parentId) {
      const Parent = this.getPost({ postId: findPost.parentId });
      if (Parent) {
        findPost.Parent = {
          postId: Parent.postId,
          User: Parent.User,
          images: Parent.images,
        };
      }
    }

    if (findPost.originalId) {
      const Original = this.getPost({ postId: findPost.originalId });
      if (Original) {
        findPost.Original = Original;
      }
    }

    return findPost;
  }

  getView({ postId }: { postId: Post['postId'] }) {
    return this.viewList.find((v) => v.postId === postId);
  }

  createUser({
    id,
    password,
    nickname,
    image,
  }: Pick<User, 'id' | 'password' | 'nickname' | 'image'>): AdvancedUser {
    const regist = new Date();
    const newUser: User = {
      id,
      password,
      nickname,
      image,
      regist,
    };
    this.userList.push(newUser);
    this.writeDatabase('userList');
    return {
      id: newUser.id,
      nickname: newUser.nickname,
      image: newUser.image,
      Followers: [],
      _count: {
        Followers: 0,
        Followings: 0,
      },
      regist,
    };
  }

  createPost({
    userId,
    content = '',
    files,
    media,
    parentId,
    originalId,
  }: {
    userId: User['id'];
    content?: Post['content'];
    files?:
      | { [fieldname: string]: Express.Multer.File[] }
      | Express.Multer.File[];
    media?: (GifType | ImageType)[];
    parentId?: Post['postId'];
    originalId?: Post['postId'];
  }): AdvancedPost | undefined {
    this.hashtagsAnalysis(content);
    this.morphologyAnalysis(content);
    const nextId = Math.max(...this.postList.map((p) => p.postId)) + 1;
    const images: PostImage[] = media
      ? media.map((m, i) => {
          if (m.type === 'gif') {
            return {
              link: m.link,
              imageId: i + 1,
              width: m.width,
              height: m.height,
            };
          }
          const file = files
            ? (Object.values(files).find(
                (v: Express.Multer.File) => v.originalname === m.fileName
              ) as Express.Multer.File)
            : undefined;
          return {
            link: file ? file.filename : '',
            imageId: i + 1,
            width: m.width,
            height: m.height,
          };
        })
      : [];
    const newPost: Post = {
      postId: isFinite(nextId) ? nextId : 1,
      userId,
      content,
      images,
      createAt: new Date(),
      parentId,
      originalId,
    };
    this.postList.push(newPost);
    this.viewsHandler({ postId: newPost.postId, create: true });
    this.writeDatabase('postList');

    return this.getFullPost({ postId: newPost.postId });
  }

  deletePost(postId: number): void {
    const targetIndex = this.postList.findIndex((p) => p.postId === postId);
    if (targetIndex > -1) {
      this.postList.splice(targetIndex, 1);
      this.writeDatabase('postList');
    }
  }

  followHandler({
    type,
    source,
    target,
  }: {
    type: 'follow' | 'unfollow';
    source: string;
    target: string;
  }): AdvancedUser | undefined {
    const isFollow = !!this.followList.find(
      (f) => f.source === source && f.target === target
    );

    switch (type) {
      case 'follow':
        if (!isFollow) {
          const nextId = Math.max(...this.followList.map((f) => f.id)) + 1;
          this.followList.push({
            id: !isFinite(nextId) ? 1 : nextId,
            source,
            target,
            createAt: new Date(),
          });
        }
        break;
      case 'unfollow':
        if (isFollow) {
          const newFollowList = this.followList.filter((f) => {
            return f.source !== source || f.target !== target;
          });
          this.followList = newFollowList;
        }
        break;
      default:
        throw new Error('unexpected type in followHander method');
    }
    this.writeDatabase('followList');

    const updatedUser = this.getUser({ id: target });
    return updatedUser;
  }

  reactionHandler({
    type,
    method,
    userId,
    postId,
    commentId,
  }: {
    type: 'Heart' | 'Repost' | 'Comment' | 'Bookmark';
    method: 'post' | 'delete';
    userId: User['id'];
    postId: Post['postId'];
    commentId?: Post['postId'];
  }): AdvancedPost | undefined {
    const isReaction = !!this.reactionList.find((r) => {
      if (type === 'Comment') {
        return (
          r.type === type &&
          r.userId === userId &&
          r.postId === postId &&
          r.commentId === commentId
        );
      }
      return r.type === type && r.userId === userId && r.postId === postId;
    });

    if (method === 'post' && !isReaction) {
      const nextId = Math.max(...this.reactionList.map((r) => r.id)) + 1;
      const newReaction: Reactions = {
        id: isFinite(nextId) ? nextId : 1,
        type,
        postId,
        userId,
        commentId: type === 'Comment' ? commentId : undefined,
      };
      this.reactionList.push(newReaction);
      this.writeDatabase('reactionList');
    } else if (method === 'delete' && isReaction) {
      this.reactionList = this.reactionList.filter(
        (r) => r.type !== type || r.postId !== postId || r.userId !== userId
      );
      this.writeDatabase('reactionList');
    }

    const updatedPost = this.getFullPost({ postId: postId });
    return updatedPost;
  }

  viewsHandler({
    key = 'impressions',
    postId,
    create,
  }: {
    key?: keyof Omit<Views, 'postId'>;
    postId: Post['postId'];
    create?: boolean;
  }) {
    const findViewIndex = this.viewList.findIndex((v) => v.postId === postId);
    if (findViewIndex > -1) {
      this.viewList[findViewIndex][key]++;
    } else {
      const newView: Views = {
        postId,
        impressions: create ? 0 : 1,
        engagements: 0,
        detailExpands: 0,
        newFollowers: 0,
        profileVisit: 0,
      };
      this.viewList.push(newView);
    }
    this.writeDatabase('viewList');

    const updatedPost = this.getFullPost({ postId });
    return updatedPost;
  }

  hashtagsAnalysis(content: string): void {
    if (!content || !content.trim()) return;

    const regex = /#[^\s#)\]]+/g;
    const hashtags = content.match(regex);
    if (hashtags) {
      const already: string[] = [];
      hashtags.forEach((t) => {
        const tag = t.replace(/#/, '');
        if (tag === '') return;
        if (already.includes(t)) return;

        const findTag = this.tagList.find(
          (t) => t.title.toLowerCase() === tag.toLowerCase()
        );

        if (findTag) {
          findTag.count++;
        } else {
          const nextId = Math.max(...this.tagList.map((t) => t.id)) + 1;
          const newTag: Tag = {
            id: isFinite(nextId) ? nextId : 1,
            type: 'tag',
            title: tag,
            count: 1,
          };
          this.tagList.push(newTag);
        }
        already.push(t);
      });
      this.writeDatabase('tagList');
    }
  }

  async morphologyAnalysis(content: string): Promise<void> {
    if (!content) return;

    const API_KEY = process.env.AI_OPEN_ETRI_API_KEY;
    if (!content || !content.trim() || !API_KEY) return;

    try {
      const requestUrl = 'http://aiopen.etri.re.kr:8000/WiseNLU_spoken';
      const body = {
        argument: {
          analysis_code: 'morp',
          text: content,
        },
      };
      const requestOptions: RequestInit = {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          Authorization: API_KEY,
        },
      };

      const response = await fetch(requestUrl, requestOptions);
      const data: Morpheme = await response.json();

      const already: string[] = [];
      data.return_object.sentence.forEach((sentence) => {
        sentence.morp.forEach((morp) => {
          if (!['NNG', 'NNP', 'NNB', 'SL'].includes(morp.type)) return;
          if (already.includes(morp.lemma.toLowerCase())) return;
          const findWord = this.tagList.find(
            (t) =>
              t.type === 'word' &&
              t.title.toLowerCase() === morp.lemma.toLowerCase()
          );
          if (findWord) {
            findWord.count++;
          } else {
            const nextId = Math.max(...this.tagList.map((t) => t.id)) + 1;
            const newWord: Word = {
              id: isFinite(nextId) ? nextId : 1,
              type: 'word',
              title: morp.lemma,
              count: 1,
              weight: morp.weight,
            };
            this.tagList.push(newWord);
          }
          already.push(morp.lemma.toLowerCase());
        });
      });
      this.writeDatabase('tagList');
    } catch (error) {
      console.error(error);
    }
  }

  writeDatabase(
    type:
      | 'userList'
      | 'postList'
      | 'tagList'
      | 'roomList'
      | 'messageList'
      | 'followList'
      | 'reactionList'
      | 'viewList'
  ): void {
    console.time(type);
    try {
      const dbPath = path.join(__dirname, '../data/');
      switch (type) {
        case 'userList':
          fs.writeJSONSync(dbPath + '/user.json', { data: this.userList });
          break;
        case 'postList':
          fs.writeJSONSync(dbPath + '/post.json', { data: this.postList });
          break;
        case 'tagList':
          fs.writeJSONSync(dbPath + '/hashtag.json', { data: this.tagList });
          break;
        case 'roomList':
          fs.writeJSONSync(dbPath + '/room.json', { data: this.roomList });
          break;
        case 'messageList':
          fs.writeJSONSync(dbPath + '/message.json', {
            data: this.messageList,
          });
          break;
        case 'followList':
          fs.writeJSONSync(dbPath + '/follow.json', { data: this.followList });
          break;
        case 'reactionList':
          fs.writeJSONSync(dbPath + '/reaction.json', {
            data: this.reactionList,
          });
          break;
        case 'viewList':
          fs.writeJsonSync(dbPath + '/views.json', {
            data: this.viewList,
          });
          break;
        default:
          throw new Error('The writeDB function received an unexpected type.');
      }
    } catch (error) {
      console.error(error);
    }
    console.timeEnd(type);
  }
}

export default DAO;
