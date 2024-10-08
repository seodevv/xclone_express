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
import { AdvancedUser, isBirth, isVerified, User } from '@/model/User';
import { AdvancedPost, GifType, ImageType, isScope, Post } from '@/model/Post';
import { Follow } from '@/model/Follow';
import { isReactionType, Reactions } from '@/model/Reaction';
import { isTag, isWord, Tag, Tags, Word } from '@/model/Hashtag';
import { AdvancedRooms, Room } from '@/model/Room';
import { Message } from '@/model/Message';
import { Morpheme } from '@/model/Morpheme';
import { Views } from '@/model/Views';
import {
  AdvancedLists,
  isListsDetailType,
  isListsMake,
  Lists,
  ListsDetail,
} from '@/model/Lists';
import { PostImage, SafeUser } from '@/db/schema';

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
        verified: u.verified ? isVerified(u.verified) : null,
        birth: isBirth(u.birth) ? u.birth : null,
        regist: new Date(u.regist),
        location: typeof u.location !== 'undefined' ? u.location : null,
        banner: typeof u.banner !== 'undefined' ? u.banner : null,
        desc: typeof u.desc !== 'undefined' ? u.desc : null,
        refer: typeof u.refer !== 'undefined' ? u.refer : null,
      }))
    );
    this.postList.push(
      ...postData.data.map((p) => ({
        ...p,
        createat: new Date(p.createat),
        scope: isScope(p.scope),
        parentid: typeof p.parentid !== 'undefined' ? p.parentid : null,
        originalid: typeof p.originalid !== 'undefined' ? p.originalid : null,
        quote: typeof p.quote !== 'undefined' ? p.quote : false,
        pinned: typeof p.pinned !== 'undefined' ? p.pinned : false,
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
        createat: new Date(r.createat),
      }))
    );
    this.messageList.push(
      ...messageData.data.map((m) => ({
        ...m,
        createat: new Date(m.createat),
      }))
    );
    this.followList.push(
      ...followData.data.map((f) => ({ ...f, createat: new Date(f.createat) }))
    );
    this.reactionList.push(
      ...reactionsData.data.map((r) => ({
        ...r,
        commentid: typeof r.commentid !== 'undefined' ? r.commentid : null,
        type: isReactionType(r.type),
        quote: typeof r.quote !== 'undefined' ? r.quote : false,
      }))
    );
    this.viewList.push(...viewsData.data);
    this.lists.push(
      ...listsData.data.map((l) => ({
        ...l,
        createat: new Date(l.createat),
        make: isListsMake(l.make),
      }))
    );
    this.listsDetail.push(
      ...listsDetailData.data.map((ld) => ({
        ...ld,
        type: isListsDetailType(ld.type),
        postid: typeof ld.postid !== 'undefined' ? ld.postid : null,
      }))
    );
    instance = this;
    console.timeEnd('Data Load');
  }

  getUserList(): AdvancedUser[] {
    const userList: AdvancedUser[] = this.userList.map((u) => {
      const Followers = this.getFollowList({ target: u.id }).map((f) => ({
        id: f.source,
      }));
      const Followings = this.getFollowList({ source: u.id }).map((f) => ({
        id: f.target,
      }));
      return {
        id: u.id,
        nickname: u.nickname,
        desc: u.desc,
        location: u.location,
        refer: u.refer,
        birth: u.birth,
        image: u.image,
        banner: u.banner,
        regist: u.regist,
        verified: u.verified,
        Followers,
        Followings,
        _count: {
          Followers: Followers.length,
          Followings: Followings.length,
        },
      };
    });
    return userList;
  }

  getPostList({
    userid,
    parentId,
    originalid,
    followIds,
    quote,
    withpostids,
  }: {
    userid?: User['id'];
    parentId?: Post['postid'];
    originalid?: Post['postid'];
    followIds?: User['id'][];
    quote?: boolean;
    withpostids?: Post['postid'][];
  }): AdvancedPost[] {
    const postList: AdvancedPost[] = [];
    this.postList.forEach((p) => {
      const post = this.getFullPost({ postid: p.postid });
      if (!post) return;
      if (
        typeof withpostids !== 'undefined' &&
        withpostids.includes(post.postid)
      ) {
        postList.push(post);
        return;
      }
      if (userid && post.userid !== userid) return;
      if (parentId && post.parentid !== parentId) return;
      if (originalid && post.originalid !== originalid) return;
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

  getRoomList(userid: User['id']): AdvancedRooms[] {
    const roomList: AdvancedRooms[] = [];
    this.roomList.forEach((r) => {
      if (r.receiverid !== userid && r.senderid !== userid) return;
      const Receiver = this.getSafeUser(r.receiverid);
      const Sender = this.getSafeUser(r.senderid);
      if (!Receiver || !Sender) return;
      roomList.push({
        ...r,
        Receiver,
        Sender,
        content: null,
        lastat: null,
      });
    });
    return roomList;
  }

  getMessageList(room: Room['id']): Message[] {
    return this.messageList
      .filter((m) => m.roomid === room)
      .sort((a, b) => (a.createat > b.createat ? 1 : -1));
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
    userid,
    postid,
  }: {
    userid?: User['id'];
    postid?: Post['postid'];
  }): Reactions[] {
    return this.reactionList.filter(
      (r) =>
        r.type === 'Heart' &&
        (userid ? r.userid === userid : true) &&
        (postid ? r.postid === postid : true)
    );
  }

  getListsList({
    sessionId,
    userid,
    make,
  }: {
    sessionId: User['id'];
    userid?: User['id'];
    make?: Lists['make'];
  }) {
    const listsList: AdvancedLists[] = [];
    this.lists.forEach((l) => {
      const list = this.getLists({ id: l.id, sessionId });
      if (!list) return;
      if (typeof userid !== 'undefined' && list.userid !== userid) return;
      if (typeof make !== 'undefined' && list.make !== make) return;

      listsList.push(list);
    });
    return listsList;
  }

  getListsDetailList({
    type,
    userid,
  }: {
    type?: ListsDetail['type'];
    userid?: ListsDetail['userid'];
  }) {
    let detailList = this.listsDetail.filter((d) => {
      let condition = !!d;
      if (typeof type !== 'undefined') {
        condition = condition && d.type === type;
      }
      if (typeof userid !== 'undefined') {
        condition = condition && d.userid === userid;
      }
      return condition;
    });

    return detailList;
  }

  getRepostList({ postid }: { postid: Post['postid'] }): Reactions[] {
    return this.reactionList.filter(
      (r) => r.type === 'Repost' && r.postid === postid
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
      const Followers = this.followList
        .filter((f) => f.target === findUser.id)
        .map((u) => ({ id: u.source }));
      const Followings = this.followList
        .filter((f) => f.source === findUser.id)
        .map((u) => ({ id: u.target }));

      const advancedUser: AdvancedUser = {
        id: findUser.id,
        nickname: findUser.nickname,
        desc: findUser.desc,
        location: findUser.location,
        refer: findUser.refer,
        birth: findUser.birth,
        image: findUser.image,
        banner: findUser.banner,
        regist: findUser.regist,
        verified: findUser.verified,
        Followers,
        Followings,
        _count: {
          Followers: Followers.length,
          Followings: Followings.length,
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
    userid,
    postid,
  }: {
    userid?: string;
    postid: number;
  }): AdvancedPost | undefined {
    const findPost = this.postList.find((p) => {
      if (userid) {
        return p.postid === postid && p.userid === userid;
      }
      return p.postid === postid;
    });
    if (!findPost) return;

    const user = this.getSafeUser(findPost.userid);
    if (!user) return;

    const Hearts = this.reactionList
      .filter((r) => r.type === 'Heart' && r.postid === findPost.postid)
      .map((r) => ({ id: r.userid }));
    const totalReposts = this.reactionList.filter(
      (r) => r.type === 'Repost' && r.postid === findPost.postid
    );
    const Reposts = totalReposts
      .filter((r) => !r.quote)
      .map((r) => ({ id: r.userid }));
    const totalComments = this.reactionList
      .filter((r) => r.type === 'Comment' && r.postid === findPost.postid)
      .map((r) => ({ id: r.userid }));
    const Comments = [...new Set(totalComments.map((v) => v.id))].map((v) => ({
      id: v,
    }));
    const Bookmarks = this.reactionList
      .filter((r) => r.type === 'Bookmark' && r.postid === findPost.postid)
      .map((r) => ({ id: r.userid }));
    const Views = this.getView({ postid })?.impressions || 0;

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
      Parent: null,
      Original: null,
    };

    return advancedPost;
  }

  getLists({
    id,
    sessionId,
    userid,
    make,
  }: {
    id: Lists['id'];
    sessionId: User['id'];
    userid?: User['id'];
    make?: Lists['make'];
  }) {
    const findList = this.lists.find((l) => {
      let condition = l.id === id;
      if (typeof userid !== 'undefined') {
        condition = condition && l.userid === userid;
      }
      if (typeof make !== 'undefined') {
        condition = condition && l.make === make;
      }
      return condition;
    });
    if (!findList) return;

    const User = this.getSafeUser(findList.userid);
    if (!User) return;

    const Member = this.listsDetail
      .filter((l) => l.type === 'member' && l.listid === findList.id)
      .map((l) => ({ id: l.userid }));
    const Follower = this.listsDetail
      .filter((l) => l.type === 'follower' && l.listid === findList.id)
      .map((l) => ({ id: l.userid }));
    const UnShow = this.listsDetail
      .filter((l) => l.type === 'unshow' && l.listid === findList.id)
      .map((l) => ({ id: l.userid }));
    const memberIds = Member.map((m) => m.id);
    const unpostids = this.listsDetail
      .filter(
        (l): l is Required<ListsDetail> =>
          l.type === 'unpost' && l.listid === findList.id && !!l.postid
      )
      .map((ld) => ld.postid);
    const Posts = this.postList
      .filter(
        (p) => memberIds.includes(p.userid) && !unpostids.includes(p.postid)
      )
      .map((p) => p.postid);
    Posts.push(
      ...this.listsDetail
        .filter(
          (
            l
          ): l is Omit<ListsDetail, 'postid'> & {
            postid: number;
          } => l.type === 'post' && l.listid === findList.id && !!l.postid
        )
        .map((l) => l.postid)
    );
    const Pinned = !!this.listsDetail.find(
      (ld) =>
        ld.listid === findList.id &&
        ld.type === 'pinned' &&
        ld.userid === sessionId
    );

    const advancedLists: AdvancedLists = {
      ...findList,
      User,
      Member,
      Follower,
      Posts,
      UnShow,
      Pinned,
    };

    return advancedLists;
  }

  getListsDetail({
    listid,
    type,
    userid,
    postid,
  }: {
    listid: ListsDetail['listid'];
    type: ListsDetail['type'];
    userid?: User['id'];
    postid?: Post['postid'];
  }): ListsDetail | undefined {
    const findListsDetail = this.listsDetail.find((ld) => {
      let condition = ld.listid === listid && ld.type === type;
      if (typeof userid !== 'undefined') {
        condition = condition && ld.userid === userid;
      }
      if (typeof postid !== 'undefined') {
        condition = condition && ld.postid === postid;
      }
      return condition;
    });

    return findListsDetail;
  }

  getRepostPost({
    originalid,
    userid,
    quote,
  }: {
    originalid: Post['postid'];
    userid?: User['id'];
    quote?: boolean;
  }): Post | undefined {
    const findPost = this.postList.find((p) => {
      let condition = p.originalid === originalid && !!p.quote === !!quote;
      if (typeof userid !== 'undefined') {
        condition = condition && p.userid === userid;
      }
      return condition;
    });
    return findPost;
  }

  getFullPost({
    userid,
    postid,
  }: {
    userid?: string;
    postid: number;
  }): AdvancedPost | undefined {
    const findPost = this.getPost({ userid: userid, postid: postid });
    if (!findPost) return;

    if (findPost.parentid) {
      const Parent = this.getPost({ postid: findPost.parentid });
      if (Parent) {
        findPost.Parent = {
          postid: Parent.postid,
          User: Parent.User,
          images: Parent.images,
        };
      }
    }

    if (findPost.originalid) {
      const Original = this.getPost({ postid: findPost.originalid });
      if (Original) {
        findPost.Original = Original;

        if (Original.quote && Original.originalid) {
          const quote = this.getPost({ postid: Original.originalid });
          if (quote) {
            findPost.Original.Original = quote;
          }
        }
      }
    }

    return findPost;
  }

  getView({ postid }: { postid: Post['postid'] }) {
    return this.viewList.find((v) => v.postid === postid);
  }

  createUser({
    id,
    password,
    nickname,
    birth,
    image,
  }: Pick<
    User,
    'id' | 'password' | 'nickname' | 'birth' | 'image'
  >): AdvancedUser {
    const regist = new Date();
    const newUser: User = {
      id,
      password,
      nickname,
      birth,
      image,
      regist,
      banner: null,
      desc: null,
      location: null,
      refer: null,
      verified: null,
    };
    this.userList.push(newUser);
    this.writeDatabase('userList');
    return {
      id: newUser.id,
      nickname: newUser.nickname,
      birth: newUser.birth,
      image: newUser.image,
      regist,
      banner: newUser.banner,
      desc: newUser.desc,
      location: newUser.location,
      refer: newUser.refer,
      verified: newUser.verified,
      Followers: [],
      Followings: [],
      _count: {
        Followers: 0,
        Followings: 0,
      },
    };
  }

  createPost({
    userid,
    content = '',
    files,
    media,
    parentId,
    originalid,
    quote,
  }: {
    userid: User['id'];
    content?: Post['content'];
    files?:
      | { [fieldname: string]: Express.Multer.File[] }
      | Express.Multer.File[];
    media?: (GifType | ImageType)[];
    parentId?: Post['postid'];
    originalid?: Post['postid'];
    quote?: boolean;
  }): AdvancedPost | undefined {
    this.hashtagsAnalysis(content);
    this.morphologyAnalysis(content);
    const nextId = Math.max(...this.postList.map((p) => p.postid)) + 1;
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
      postid: isFinite(nextId) ? nextId : 1,
      userid: userid,
      content,
      images,
      createat: new Date(),
      parentid: typeof parentId !== 'undefined' ? parentId : null,
      originalid: typeof originalid !== 'undefined' ? originalid : null,
      quote: typeof quote !== 'undefined' ? quote : false,
      pinned: false,
      scope: 'every',
    };
    this.postList.push(newPost);
    this.viewsHandler({ postid: newPost.postid, create: true });
    this.writeDatabase('postList');

    return this.getFullPost({ postid: newPost.postid });
  }

  createList({
    userid,
    name,
    description = '',
    banner,
    thumbnail,
    make,
  }: {
    userid: User['id'];
    name: string;
    description?: string;
    banner: string;
    thumbnail: string;
    make: 'private' | 'public';
  }): AdvancedLists | undefined {
    const nextId = Math.max(...this.lists.map((l) => l.id)) + 1;
    const newList: Lists = {
      id: isFinite(nextId) ? nextId : 1,
      userid,
      name,
      description,
      banner,
      thumbnail,
      make,
      createat: new Date(),
    };
    this.lists.push(newList);
    this.writeDatabase('lists');

    return this.getLists({ id: newList.id, sessionId: userid });
  }

  updateUser({
    id,
    nickname,
    desc,
    location,
    birth,
    refer,
    image,
    banner,
    verified,
  }: {
    id: User['id'];
    nickname?: User['nickname'];
    desc?: User['desc'];
    location?: User['location'];
    birth?: User['birth'];
    refer?: User['refer'];
    image?: User['image'];
    banner?: User['banner'];
    verified?: User['verified'];
  }) {
    const findUserRaw = this.userList.find((u) => u.id === id);
    if (!findUserRaw) return;

    const updatedUserRaow: User = {
      ...findUserRaw,
      nickname:
        typeof nickname !== 'undefined' ? nickname : findUserRaw.nickname,
      desc: typeof desc !== 'undefined' ? desc : findUserRaw.desc,
      location:
        typeof location !== 'undefined' ? location : findUserRaw.location,
      birth: typeof birth !== 'undefined' ? birth : findUserRaw.birth,
      refer: typeof refer !== 'undefined' ? refer : findUserRaw.refer,
      image: typeof image !== 'undefined' ? image : findUserRaw.image,
      banner:
        typeof banner !== 'undefined'
          ? banner === ''
            ? null
            : banner
          : findUserRaw.banner,
      verified:
        typeof verified !== 'undefined' ? verified : findUserRaw.verified,
    };

    const index = this.userList.findIndex((u) => u.id === id);
    if (index > -1) {
      this.userList[index] = updatedUserRaow;
      this.writeDatabase('userList');
    }

    return this.getUser({ id });
  }

  updatePost({
    userid,
    postid,
    content,
    images,
    pinned,
    scope,
  }: {
    postid: Post['postid'];
    userid: User['id'];
    content?: Post['content'];
    images?: PostImage[];
    pinned?: Post['pinned'];
    scope?: Post['scope'];
  }): AdvancedPost | undefined {
    const findPostRaw = this.postList.find(
      (p) => p.userid === userid && p.postid === postid
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

    return this.getPost({ userid, postid });
  }

  updateLists({
    id,
    userid,
    name,
    description,
    banner,
    thumbnail,
    make,
  }: {
    id: Lists['id'];
    userid: Lists['userid'];
    name?: Lists['name'];
    description?: Lists['description'];
    banner?: Lists['banner'];
    thumbnail?: Lists['thumbnail'];
    make?: Lists['make'];
  }) {
    const findListsRaw = this.lists.find(
      (l) => l.id === id && l.userid === userid
    );
    if (!findListsRaw) return;

    const updatedListRaw: Lists = {
      ...findListsRaw,
      name: typeof name !== 'undefined' ? name : findListsRaw.name,
      description:
        typeof description !== 'undefined'
          ? description
          : findListsRaw.description,
      banner: typeof banner !== 'undefined' ? banner : findListsRaw.banner,
      thumbnail:
        typeof thumbnail !== 'undefined' ? thumbnail : findListsRaw.thumbnail,
      make: typeof make !== 'undefined' ? make : findListsRaw.make,
    };

    const index = this.lists.findIndex((l) => l === findListsRaw);
    if (index > -1) {
      this.lists[index] = updatedListRaw;
      this.writeDatabase('lists');
    }

    return this.getLists({ id, userid, sessionId: userid });
  }

  deleteBirth({ id }: { id: User['id'] }) {
    const index = this.userList.findIndex((u) => u.id === id);
    if (index === -1) return;

    this.userList[index] = {
      ...this.userList[index],
      birth: null,
    };
    this.writeDatabase('userList');

    return this.getUser({ id });
  }

  deletePost({ postid }: { postid: number }): void {
    const newPostList = this.postList.filter((p) => p.postid !== postid);
    this.postList = newPostList;
    this.writeDatabase('postList');
  }

  deleteReaction({ postid }: { postid: Post['postid'] }): void {
    const newReactionList = this.reactionList.filter(
      (r) => r.postid !== postid
    );
    this.reactionList = newReactionList;
    this.writeDatabase('reactionList');
  }

  deleteView({ postid }: { postid: Post['postid'] }): void {
    const newViewList = this.viewList.filter((v) => v.postid !== postid);
    this.viewList = newViewList;
    this.writeDatabase('viewList');
  }

  deleteLists({ id, userid }: { id: Lists['id']; userid: Lists['userid'] }) {
    const newListslist = this.lists.filter(
      (l) => l.id !== id || l.userid !== userid
    );
    this.lists = newListslist;
    this.writeDatabase('lists');
    this.deleteListsDetail({ listid: id });
  }

  deleteListsDetail({ listid }: { listid: Lists['id'] }) {
    const newListsDetailList = this.listsDetail.filter(
      (ld) => ld.listid !== listid
    );
    this.listsDetail = newListsDetailList;
    this.writeDatabase('listsDetail');
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
            createat: new Date(),
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
    userid,
    postid,
    commentid,
    quote,
  }: {
    type: 'Heart' | 'Repost' | 'Comment' | 'Bookmark';
    method: 'post' | 'delete';
    userid: User['id'];
    postid: Post['postid'];
    commentid?: Post['postid'];
    quote?: boolean;
  }): AdvancedPost | undefined {
    const isReaction = !!this.reactionList.find((r) => {
      const condition =
        r.type === type && r.userid === userid && r.postid === postid;
      if (type === 'Comment') return condition && r.commentid === commentid;
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
        postid,
        userid,
        commentid:
          type === 'Comment'
            ? typeof commentid !== 'undefined'
              ? commentid
              : null
            : null,
        quote: typeof quote !== 'undefined' ? quote : false,
      };
      this.reactionList.push(newReaction);
      this.writeDatabase('reactionList');
    } else if (method === 'delete' && isReaction) {
      this.reactionList = this.reactionList.filter(
        (r) =>
          r.type !== type ||
          r.postid !== postid ||
          r.userid !== userid ||
          r.quote !== quote
      );
      this.writeDatabase('reactionList');
    }

    const updatedPost = this.getFullPost({ postid: postid });
    return updatedPost;
  }

  viewsHandler({
    key = 'impressions',
    postid,
    create,
  }: {
    key?: keyof Omit<Views, 'postid'>;
    postid: Post['postid'];
    create?: boolean;
  }) {
    const findViewIndex = this.viewList.findIndex((v) => v.postid === postid);
    if (findViewIndex > -1) {
      this.viewList[findViewIndex][key]++;
    } else {
      const newView: Views = {
        postid,
        impressions: create ? 0 : 1,
        engagements: 0,
        detailexpands: 0,
        newfollowers: 0,
        profilevisit: 0,
      };
      this.viewList.push(newView);
    }
    this.writeDatabase('viewList');

    const updatedPost = this.getFullPost({ postid });
    return updatedPost;
  }

  listsDetailHandler({
    method,
    type,
    listid,
    userid,
    postid,
  }: {
    method: 'post' | 'delete';
    type: ListsDetail['type']; // member | post | unpost | follow | pinned | unshow;
    listid: Lists['id'];
    userid: User['id'];
    postid?: Post['postid'];
  }) {
    const already = !!this.getListsDetail({ listid, type, userid, postid });

    if (method === 'post' && !already) {
      const nextId = Math.max(...this.listsDetail.map((ld) => ld.id)) + 1;
      const newListsDetail: ListsDetail = {
        id: isFinite(nextId) ? nextId : 1,
        listid,
        type,
        userid,
        postid: typeof postid !== 'undefined' ? postid : null,
      };
      this.listsDetail.push(newListsDetail);
      this.writeDatabase('listsDetail');
    } else if (method === 'delete' && already) {
      this.listsDetail = this.listsDetail.filter((ld) => {
        let condition =
          ld.type === type && ld.listid === listid && ld.userid === userid;
        if (typeof postid !== 'undefined') {
          condition = condition && ld.postid === postid;
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
