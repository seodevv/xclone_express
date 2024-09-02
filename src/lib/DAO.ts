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
import listsData from '@/data/lists.json';
import listsDetailData from '@/data/listsdetail.json';
import { AdvancedUser, isVerified, SafeUser, User } from '@/model/User';
import { AdvancedPost, GifType, ImageType, isScope, Post } from '@/model/Post';
import { PostImage } from '@/model/PostImage';
import { Follow } from '@/model/Follow';
import { Reactions } from '@/model/Reaction';
import { isTag, isWord, Tag, Tags, Word } from '@/model/Hashtag';
import { AdvancedRoom, Room } from '@/model/Room';
import { Message } from '@/model/Message';
import { Morpheme } from '@/model/Morpheme';
import { Views } from '@/model/Views';
import {
  AdvancedLists,
  Lists,
  ListsDetail,
  ListsDetailRaw,
  ListsRaw,
} from '@/model/Lists';

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
  private lists: Lists[] = [];
  private listsDetail: ListsDetail[] = [];

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
        scope: isScope(p.scope),
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
    this.lists.push(
      ...listsData.data
        .map((l) => ({ ...l, createAt: new Date(l.createAt) }))
        .filter(
          (l: ListsRaw): l is Lists =>
            l.make === 'private' || l.make === 'public'
        )
    );
    this.listsDetail.push(
      ...listsDetailData.data.filter(
        (ld: ListsDetailRaw): ld is ListsDetail =>
          ld.type === 'member' || ld.type === 'post' || ld.type === 'follower'
      )
    );
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
    originalId,
    followIds,
    quote,
    withPostIds,
  }: {
    userId?: User['id'];
    parentId?: Post['postId'];
    originalId?: Post['postId'];
    followIds?: User['id'][];
    quote?: boolean;
    withPostIds?: Post['postId'][];
  }): AdvancedPost[] {
    const postList: AdvancedPost[] = [];
    this.postList.forEach((p) => {
      const post = this.getFullPost({ postId: p.postId });
      if (!post) return;
      if (
        typeof withPostIds !== 'undefined' &&
        withPostIds.includes(post.postId)
      ) {
        postList.push(post);
        return;
      }
      if (userId && post.userId !== userId) return;
      if (parentId && post.parentId !== parentId) return;
      if (originalId && post.originalId !== originalId) return;
      if (followIds && !followIds.includes(post.User.id)) return;
      if (typeof quote !== 'undefined' && post.quote !== quote) return;

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

  getLikeList({
    userId,
    postId,
  }: {
    userId?: User['id'];
    postId?: Post['postId'];
  }): Reactions[] {
    return this.reactionList.filter(
      (r) =>
        r.type === 'Heart' &&
        (userId ? r.userId === userId : true) &&
        (postId ? r.postId === postId : true)
    );
  }

  getListsList({
    userId,
    make,
  }: {
    userId?: User['id'];
    make?: Lists['make'];
  }) {
    const listsList: AdvancedLists[] = [];
    this.lists.forEach((l) => {
      const list = this.getLists({ id: l.id });
      if (!list) return;
      if (typeof userId !== 'undefined' && list.userId !== userId) return;
      if (typeof make !== 'undefined' && list.make !== make) return;

      listsList.push(list);
    });
    return listsList;
  }

  getRepostList({ postId }: { postId: Post['postId'] }): Reactions[] {
    return this.reactionList.filter(
      (r) => r.type === 'Repost' && r.postId === postId
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
        verified: advancedUser.verified,
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
    const totalReposts = this.reactionList.filter(
      (r) => r.type === 'Repost' && r.postId === findPost.postId
    );
    const Reposts = totalReposts
      .filter((r) => !r.quote)
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
        Reposts: totalReposts.length,
        Comments: totalComments.length,
        Bookmarks: Bookmarks.length,
        Views,
      },
    };

    return advancedPost;
  }

  getLists({
    id,
    userId,
    make,
  }: {
    id: Lists['id'];
    userId?: User['id'];
    make?: Lists['make'];
  }) {
    const findList = this.lists.find((l) => {
      let condition = l.id === id;
      if (typeof userId !== 'undefined') {
        condition = condition && l.userId === userId;
      }
      if (typeof make !== 'undefined') {
        condition = condition && l.make === make;
      }
      return condition;
    });
    if (!findList) return;

    const member = this.listsDetail
      .filter((l) => l.type === 'member' && l.listId === findList.id)
      .map((l) => ({ id: l.userId }));
    const follower = this.listsDetail
      .filter((l) => l.type === 'follower' && l.listId === findList.id)
      .map((l) => ({ id: l.userId }));
    const posts = this.listsDetail
      .filter(
        (l): l is Required<ListsDetail> =>
          l.type === 'post' && l.listId === findList.id && !!l.postId
      )
      .map((l) => l.postId);

    const advancedLists: AdvancedLists = {
      ...findList,
      member,
      follower,
      posts,
    };

    return advancedLists;
  }

  getListsDetail({
    listId,
    type,
    userId,
    postId,
  }: {
    listId: ListsDetail['listId'];
    type: ListsDetail['type'];
    userId?: User['id'];
    postId?: Post['postId'];
  }): ListsDetail | undefined {
    const findListsDetail = this.listsDetail.find((ld) => {
      let condition = ld.listId === listId && ld.type === type;
      if (typeof userId !== 'undefined') {
        condition = condition && ld.userId === userId;
      }
      if (typeof postId !== 'undefined') {
        condition = condition && ld.postId === postId;
      }
      return condition;
    });

    return findListsDetail;
  }

  getRepostPost({
    originalId,
    userId,
    quote,
  }: {
    originalId: Post['postId'];
    userId?: User['id'];
    quote?: boolean;
  }): Post | undefined {
    const findPost = this.postList.find((p) => {
      let condition = p.originalId === originalId && !!p.quote === !!quote;
      if (typeof userId !== 'undefined') {
        condition = condition && p.userId === userId;
      }
      return condition;
    });
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

        if (Original.quote && Original.originalId) {
          const quote = this.getPost({ postId: Original.originalId });
          if (quote) {
            findPost.Original.Original = quote;
          }
        }
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
    quote,
  }: {
    userId: User['id'];
    content?: Post['content'];
    files?:
      | { [fieldname: string]: Express.Multer.File[] }
      | Express.Multer.File[];
    media?: (GifType | ImageType)[];
    parentId?: Post['postId'];
    originalId?: Post['postId'];
    quote?: boolean;
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
      quote,
    };
    this.postList.push(newPost);
    this.viewsHandler({ postId: newPost.postId, create: true });
    this.writeDatabase('postList');

    return this.getFullPost({ postId: newPost.postId });
  }

  createList({
    userId,
    name,
    description = '',
    banner,
    thumbnail,
    make,
  }: {
    userId: User['id'];
    name: string;
    description?: string;
    banner: string;
    thumbnail: string;
    make: 'private' | 'public';
  }): Lists {
    const nextId = Math.max(...this.lists.map((l) => l.id)) + 1;
    const newList: Lists = {
      id: isFinite(nextId) ? nextId : 1,
      userId,
      name,
      description,
      banner,
      thumbnail,
      make,
      pinned: false,
      createAt: new Date(),
    };
    this.lists.push(newList);
    this.writeDatabase('lists');

    return newList;
  }

  updatePost({
    userId,
    postId,
    content,
    images,
    pinned,
    scope,
  }: {
    postId: Post['postId'];
    userId: User['id'];
    content?: Post['content'];
    images?: PostImage[];
    pinned?: Post['pinned'];
    scope?: Post['scope'];
  }): AdvancedPost | undefined {
    const findPostRaw = this.postList.find(
      (p) => p.userId === userId && p.postId === postId
    );
    if (!findPostRaw) return;

    const updatedPostRaw: Post = {
      ...findPostRaw,
      content: typeof content !== 'undefined' ? content : findPostRaw.content,
      images: typeof images !== 'undefined' ? images : findPostRaw.images,
      pinned: !!pinned,
      scope: typeof scope !== 'undefined' ? scope : findPostRaw.scope,
    };

    const index = this.postList.findIndex((p) => p === findPostRaw);
    if (index > -1) {
      this.postList[index] = updatedPostRaw;
      this.writeDatabase('postList');
    }

    return this.getPost({ userId, postId });
  }

  deletePost({ postId }: { postId: number }): void {
    const newPostList = this.postList.filter((p) => p.postId !== postId);
    this.postList = newPostList;
    this.writeDatabase('postList');
  }

  deleteReaction({ postId }: { postId: Post['postId'] }): void {
    const newReactionList = this.reactionList.filter(
      (r) => r.postId !== postId
    );
    this.reactionList = newReactionList;
    this.writeDatabase('reactionList');
  }

  deleteView({ postId }: { postId: Post['postId'] }): void {
    const newViewList = this.viewList.filter((v) => v.postId !== postId);
    this.viewList = newViewList;
    this.writeDatabase('viewList');
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
    quote,
  }: {
    type: 'Heart' | 'Repost' | 'Comment' | 'Bookmark';
    method: 'post' | 'delete';
    userId: User['id'];
    postId: Post['postId'];
    commentId?: Post['postId'];
    quote?: boolean;
  }): AdvancedPost | undefined {
    const isReaction = !!this.reactionList.find((r) => {
      const condition =
        r.type === type && r.userId === userId && r.postId === postId;
      if (type === 'Comment') return condition && r.commentId === commentId;
      if (type === 'Repost' && quote) return condition && r.quote;
      if (type === 'Repost' && !quote)
        return condition && typeof r.quote === 'undefined';

      return condition;
    });

    if (method === 'post' && !isReaction) {
      const nextId = Math.max(...this.reactionList.map((r) => r.id)) + 1;
      const newReaction: Reactions = {
        id: isFinite(nextId) ? nextId : 1,
        type,
        postId,
        userId,
        commentId: type === 'Comment' ? commentId : undefined,
        quote,
      };
      this.reactionList.push(newReaction);
      this.writeDatabase('reactionList');
    } else if (method === 'delete' && isReaction) {
      this.reactionList = this.reactionList.filter(
        (r) =>
          r.type !== type ||
          r.postId !== postId ||
          r.userId !== userId ||
          r.quote !== quote
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

  listsDetailHandler({
    method,
    type,
    listId,
    userId,
    postId,
  }: {
    method: 'post' | 'delete';
    type: ListsDetail['type']; // member | post | follow;
    listId: Lists['id'];
    userId: User['id'];
    postId?: Post['postId'];
  }) {
    const already = !!this.getListsDetail({ listId, type, userId, postId });

    if (method === 'post' && !already) {
      const nextId = Math.max(...this.listsDetail.map((ld) => ld.id)) + 1;
      const newListsDetail: ListsDetail = {
        id: isFinite(nextId) ? nextId : 1,
        listId,
        type,
        userId,
        postId,
      };
      this.listsDetail.push(newListsDetail);
      this.writeDatabase('listsDetail');
    } else if (method === 'delete' && already) {
      this.listsDetail = this.listsDetail.filter((ld) => {
        let condition =
          ld.type === type && ld.listId === listId && ld.userId === userId;
        if (typeof postId !== 'undefined') {
          condition = condition && ld.postId === postId;
        }
        return !condition;
      });
      this.writeDatabase('listsDetail');
    }
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
      | 'lists'
      | 'listsDetail'
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
        case 'lists':
          fs.writeJsonSync(dbPath + '/lists.json', {
            data: this.lists,
          });
          break;
        case 'listsDetail':
          fs.writeJsonSync(dbPath + '/listsdetail.json', {
            data: this.listsDetail,
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
