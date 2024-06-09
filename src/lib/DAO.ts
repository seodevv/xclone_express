import path from 'path';
import fs from 'fs-extra';
import { AdvancedUser, SafeUser, User, UserId } from '@/model/User';
import { AdvancedPost, Post } from '@/model/Post';
import { HashTag } from '@/model/Hashtag';
import { AdvancedRoom, Room } from '@/model/Room';
import { Message } from '@/model/Message';
import { Follow } from '@/model/Follow';
import { Reactions } from '@/model/Reaction';
import userData from '@/data/user.json';
import postData from '@/data/post.json';
import tagData from '@/data/hashtag.json';
import roomData from '@/data/room.json';
import messageData from '@/data/message.json';
import followData from '@/data/follow.json';
import reactionsData from '@/data/reaction.json';

let instance: DAO | null;

class DAO {
  private userList: User[] = [];
  private postList: Post[] = [];
  private tagList: HashTag[] = [];
  private roomList: Room[] = [];
  private messageList: Message[] = [];
  private followList: Follow[] = [];
  private reactionList: Reactions[] = [];

  constructor() {
    if (instance) {
      return instance;
    }

    console.time('Data Load');
    this.userList.push(...userData.data);
    this.postList.push(
      ...postData.data.map((p) => ({
        ...p,
        createAt: new Date(p.createAt),
      }))
    );
    this.tagList.push(...tagData.data);
    this.roomList.push(
      ...roomData.data.map((r) => ({ ...r, createdAt: new Date(r.createdAt) }))
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
    instance = this;
    console.timeEnd('Data Load');
  }

  getUserList(): AdvancedUser[] {
    const userList: AdvancedUser[] = this.userList.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      image: u.image,
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

  getPostList(userId?: string): AdvancedPost[] {
    const postList: AdvancedPost[] = [];
    this.postList.forEach((p) => {
      const post = this.getFullPost(p.postId);
      if (!post) return;
      if (userId && post.userId !== userId) return;

      postList.push(post);
    });

    return postList;
  }

  getTagList() {
    return [...this.tagList];
  }

  getRoomList(userId: User['id']) {
    const roomList: AdvancedRoom[] = [];
    this.roomList.forEach((r) => {
      if (r.ReceiverId !== userId && r.SenderId !== userId) return;
      const Receiver = this.getSafeUser(r.ReceiverId);
      const Sender = this.getSafeUser(r.SenderId);
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

  getUser(
    id: User['id'],
    password?: User['password']
  ): AdvancedUser | undefined {
    let findUser: User | undefined;
    if (password) {
      findUser = this.userList.find(
        (u) => u.id === id && u.password === password
      );
    } else {
      findUser = this.userList.find((u) => u.id === id);
    }

    if (findUser) {
      const advancedUser: AdvancedUser = {
        id: findUser.id,
        nickname: findUser.nickname,
        image: findUser.image,
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
    const advancedUser = this.getUser(id);
    if (advancedUser) {
      return {
        id: advancedUser.id,
        image: advancedUser.image,
        nickname: advancedUser.nickname,
      };
    }
  }

  getPost(postId: number): AdvancedPost | undefined {
    const findPost = this.postList.find((p) => p.postId === postId);
    if (!findPost) return;

    const user = this.userList.find((u) => u.id === findPost.userId);
    if (!user) return;

    const Hearts = this.reactionList
      .filter((r) => r.type === 'Heart' && r.postId === findPost.postId)
      .map((r) => ({ id: r.userId }));
    const Reposts = this.reactionList
      .filter((r) => r.type === 'Repost' && r.postId === findPost.postId)
      .map((r) => ({ id: r.userId }));
    const Comments = this.reactionList
      .filter((r) => r.type === 'Comment' && r.postId === findPost.postId)
      .map((r) => ({ id: r.userId }));
    const advancedPost: AdvancedPost = {
      ...findPost,
      User: user,
      Hearts,
      Reposts,
      Comments,
      _count: {
        Hearts: Hearts.length,
        Reposts: Reposts.length,
        Comments: Comments.length,
      },
    };

    return advancedPost;
  }

  getFullPost(postId: number): AdvancedPost | undefined {
    const findPost = this.getPost(postId);
    if (!findPost) return;

    if (findPost.ParentId) {
      const Parent = this.getPost(findPost.ParentId);
      if (Parent) {
        findPost.Parent = {
          postId: Parent.postId,
          User: Parent.User,
          images: Parent.Images,
        };
      }
    }

    if (findPost.OriginalId) {
      const Original = this.getPost(findPost.OriginalId);
      if (Original) {
        findPost.Original = Original;
      }
    }

    return findPost;
  }

  createUser({ id, password, nickname, image }: User): AdvancedUser {
    const newUser: User = {
      id,
      password,
      nickname,
      image,
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
    };
  }

  createPost({
    user,
    content,
    files,
    Parent,
    Original,
  }: {
    user: User;
    content: string;
    files?:
      | { [fieldname: string]: Express.Multer.File[] }
      | Express.Multer.File[];
    Parent?: Post['Parent'];
    Original?: Post;
  }) {
    this.hashtagsAnalysis(content);
    const newPost: Post = {
      postId: Math.max(...this.postList.map((p) => p.postId)) + 1,
      User: { id: user.id, image: user.image, nickname: user.nickname },
      content,
      Images: files
        ? Object.values(files).map((v, i) => ({
            link: v.filename,
            imageId: i + 1,
          }))
        : [],
      createAt: new Date(),
      Hearts: [],
      Reposts: [],
      Comments: [],
      _count: {
        Hearts: 0,
        Reposts: 0,
        Comments: 0,
      },
      Parent,
      Original,
    };
    this.postList.push(newPost);
    this.writeDatabase('postList');
    return newPost;
  }
  updatePost({
    postId,
    Hearts,
    Reposts,
    Comments,
    _count,
  }: Pick<Post, 'postId'> &
    Partial<Pick<Post, 'Hearts' | 'Reposts' | 'Comments' | '_count'>>) {
    let target = this.postList.find((p) => p.postId === postId);
    if (target) {
      target.Hearts = Hearts ? Hearts : target.Hearts;
      target.Reposts = Reposts ? Reposts : target.Reposts;
      target.Comments = Comments ? Comments : target.Comments;
      target._count = _count ? _count : target._count;
      this.writeDatabase('postList');
    }
    return target;
  }
  deletePost(id: number) {
    const targetIndex = this.postList.findIndex((p) => p.postId === id);
    if (targetIndex !== -1) {
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
  }) {
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

    const updatedUser = this.getUser(target);
    return updatedUser;
  }

  hashtagsAnalysis(content: string) {
    if (!content || !content.trim()) return;

    const regex = /#[^\s#)\]]+/g;
    const hashtags = content.match(regex);
    if (hashtags) {
      hashtags.forEach((t) => {
        const tag = t.replace(/#/, '');
        if (tag === '') return;

        const findTag = this.tagList.find(
          (t) => t.title.toLowerCase() === tag.toLowerCase()
        );

        if (findTag) {
          findTag.count++;
        } else {
          const newTag: HashTag = {
            title: tag,
            count: 1,
          };
          this.tagList.push(newTag);
        }
      });
      this.writeDatabase('tagList');
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
  ) {
    console.time(type);
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
        fs.writeJSONSync(dbPath + '/message.json', { data: this.messageList });
        break;
      case 'followList':
        fs.writeJSONSync(dbPath + '/follow.json', { data: this.followList });
        break;
      case 'reactionList':
        fs.writeJSONSync(dbPath + '/reaction.json', {
          data: this.reactionList,
        });
        break;

      default:
        throw new Error('The writeDB function received an unexpected type.');
    }
    console.timeEnd(type);
  }
}

export default DAO;
