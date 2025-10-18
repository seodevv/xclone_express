import {
  ClientToServerEvents,
  ServerToClientEvents,
} from './../src/model/Socket';
import io, { Socket } from 'socket.io-client';
import path from 'path';
import fs from 'fs-extra';
import request from 'supertest';
import { encryptRoomId } from '../src/lib/common';
import { server, uploadPath } from '../src/app';
import DAO from '../src/lib/DAO';
import { AdvancedUser } from '../src/model/User';
import { AdvancedPost } from '../src/model/Post';
import { Schemas } from '../src/db/schema';
import { AdvancedRooms } from '../src/model/Room';
import { AdvancedMessages } from '../src/model/Message';
import { AdvancedLists } from '../src/model/Lists';
import { HashTags } from '../src/model/Hashtag';
import crypto from 'crypto';
import http from 'http';

interface CustomSocket
  extends Socket<ServerToClientEvents, ClientToServerEvents> {
  data?: {
    sessionId: string;
  };
}

interface User {
  id: string;
  password: string;
  nickname: string;
  image: string;
  User?: AdvancedUser;
  Post?: AdvancedPost;
  List?: AdvancedLists;
  Room?: AdvancedRooms;
  Messages?: AdvancedMessages[];
}

process.env.NODE_NEV = 'test';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function randomString(length = 10) {
  return crypto
    .randomBytes(length)
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, length);
}

const agent = request.agent(server);
const tester: User = {
  id: randomString(),
  password: randomString(),
  nickname: randomString(),
  image: 'jest.png',
};
const target: User = {
  id: randomString(),
  password: randomString(),
  nickname: randomString(),
  image: 'target.png',
};
const roomid = encryptRoomId(tester.id, target.id);
let client: CustomSocket;

beforeAll(async () => {
  // watting for the server to listen
  await new Promise<void>((resolve, reject) => {
    server.on('listening', () => {
      resolve();
    });
    server.on('error', (err) => {
      reject(err);
    });
  });

  // waits for the websocket to connect to the server
  await new Promise<void>((resolve, reject) => {
    client = io(
      `${
        server instanceof http.Server ? 'http' : 'https'
      }://127.0.0.1:9090/messages`,
      {
        rejectUnauthorized: false,
        retries: 0,
        auth: {
          sessionId: tester.id,
        },
      }
    );
    client.on('connect', () => {
      resolve();
    });
    client.on('connect_error', (err) => {
      console.error(err);
      reject();
    });
  });

  // create target users to use for testing
  await new Promise<void>((resolve, reject) => {
    agent
      .post('/api/users')
      .type('form')
      .field('id', target.id)
      .field('password', target.password)
      .field('nickname', target.nickname)
      .attach('image', path.resolve(__dirname, target.image))
      .then((res) => {
        target.User = res.body.data;
        resolve();
      })
      .catch((err) => {
        console.error('err', err);
        reject();
      });
  });

  // create post for target user to use in testing
  await new Promise<void>((resolve, reject) => {
    const content = 'This article is for testing purposes only.';
    agent
      .post('/api/posts')
      .type('form')
      .field('content', content)
      .field(
        'mediaInfo',
        JSON.stringify([
          { type: 'image', fileName: target.image, width: 100, height: 100 },
        ])
      )
      .attach('images', path.resolve(__dirname, target.image))
      .then((res) => {
        target.Post = res.body.data;
        resolve();
      })
      .catch((err) => {
        console.error(err);
        reject();
      });
  });

  // create list for target user to use in testing
  await new Promise<void>((resolve, reject) => {
    const name = `${target.id}'s list`;
    const description = `this is ${target.id}'s list`;
    const make = 'public';
    const image = path.resolve(__dirname, target.image);

    agent
      .post('/api/lists')
      .type('form')
      .field('name', name)
      .field('description', description)
      .field('make', make)
      .attach('banner', image)
      .attach('thumbnail', image)
      .then((res) => {
        target.List = res.body.data;
        res.body.data;
        resolve();
      })
      .catch((err) => {
        console.error(err);
        reject(err);
      });
  });

  // log out (clear cookie)
  await new Promise<void>((resolve, reject) => {
    agent
      .post('/api/logout')
      .then(() => resolve())
      .catch((err) => reject(err));
  });
}, 10000);

afterAll(async () => {
  const dao = new DAO();

  // delete the image from the post that was used for testing
  if (target.Post?.images.length !== 0) {
    target.Post?.images.forEach((image) => {
      if (image.link === '') return;
      const imagePath = path.resolve(uploadPath, image.link);
      fs.removeSync(imagePath);
    });
  }

  // delete the image from the list that was used for testing
  if (target.List?.banner) {
    const imagePath = path.resolve(uploadPath, target.List.banner);
    fs.removeSync(imagePath);
  }
  if (target.List?.thumbnail) {
    const imagePath = path.resolve(uploadPath, target.List.thumbnail);
    fs.removeSync(imagePath);
  }

  // delete the user that was used for testing
  for (const id of [tester.id, target.id]) {
    const user = await dao.getUser({ id });
    if (typeof user?.image !== 'undefined' && user.image !== '') {
      const imagePath = path.resolve(uploadPath, user.image);
      fs.removeSync(imagePath);
    }
    await dao.deleteUser({ id });
  }
  dao.release();

  // wait for websocket to close
  await new Promise<void>((resolve) => {
    client.once('disconnect', () => resolve());
    client.close();
  });

  // wait for the server to close
  await new Promise<void>((resolve, rejcet) => {
    server.close((err) => {
      if (err) return rejcet(err);
      resolve();
    });
  });
});

// route - /api
describe('Login API scenario', () => {
  it('should create a new user', async () => {
    const res = await agent
      .post('/api/users')
      .type('form')
      .field('id', tester.id)
      .field('password', tester.password)
      .field('nickname', tester.nickname)
      .attach('image', path.resolve(__dirname, tester.image));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ data: { id: tester.id } });
  });

  it('should check password', async () => {
    const res = await agent
      .post('/api/confirm')
      .send({
        password: tester.password,
      })
      .set({ accept: 'application/json' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { id: tester.id } });
  });

  it('should changed password', async () => {
    const newPassword = randomString();
    const res = await agent
      .post('/api/password')
      .send({
        current: tester.password,
        newPassword,
      })
      .set({ accept: 'application/json' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { id: tester.id } });

    tester.password = newPassword;
  });

  it('should logout a user', async () => {
    const res = await agent.post('/api/logout');

    expect(res.status).toBe(200);
  });

  it('should need to login', async () => {
    const res = await agent
      .post('/api/login')
      .type('form')
      .field('id', tester.id)
      .field('password', tester.password);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { id: tester.id } });
    tester.User = res.body.data;
  });

  it('should receive image in response', async () => {
    if (typeof tester.User === 'undefined') {
      throw new Error('login is required first');
    }

    const res = await agent.get(`/api/image/${tester.User.image}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
  });
});

// route - /api/users
describe('Users API scenario', () => {
  it('should get my profile', async () => {
    const res = await agent.get('/api/users');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { id: tester.id } });
  });

  it('should search target user', async () => {
    const res = await agent.get(
      `/api/users/search?cursor=0&size=10&q=${tester.id}&self=on`
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: tester.id })])
    );
  });

  it('should be viewed follower recommends', async () => {
    const res = await agent.get(
      '/api/users/followRecommends?cursor=0&size=10&mode=all'
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Array) });
  });

  it('should update my birth', async () => {
    const date = new Date().toLocaleDateString('sv-SE');
    const res = await agent
      .post('/api/users/edit')
      .type('form')
      .field(
        'birth',
        JSON.stringify({
          date,
          scope: {
            month: 'public',
            year: 'public',
          },
        })
      )
      .field(
        'updated',
        JSON.stringify({
          birth: true,
        })
      );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { id: tester.id, birth: { date } },
    });
  });

  it('should delete my birth', async () => {
    const res = await agent.delete('/api/users/birth');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { id: tester.id, birth: null } });
  });

  it('should update my verify', async () => {
    const verified = 'blue';
    const res = await agent
      .post('/api/users/verified')
      .send({
        verified,
      })
      .set({
        accept: 'application/json',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { id: tester.id, verified: { type: verified } },
    });
  });

  it('should delete my verify', async () => {
    const res = await agent.delete('/api/users/verified');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { id: tester.id, verified: null },
    });
  });

  it('should get target user', async () => {
    const res = await agent.get(`/api/users/${target.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { id: target.id } });
  });

  it("should get target user's posts", async () => {
    const res = await agent.get(`/api/users/${target.id}/posts`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Array) });
  });

  it("shuold get target user's lists", async () => {
    const res = await agent.get(
      `/api/users/${target.id}/lists?cursor=0&size=10`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Array) });
  });

  it("should get target user's post count", async () => {
    const res = await agent.get(`/api/users/${target.id}/posts/count`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Number) });
  });

  it("should get target user's follow info", async () => {
    const res = await agent.get(
      `/api/users/${target.id}/follow?cursor=0&size=10&type=follow`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Array) });
  });

  it('should follow target user', async () => {
    const res = await agent.post(`/api/users/${target.id}/follow`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('Followers');
    expect(res.body.data.Followers).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: tester.id })])
    );
  });

  it('should unfollow target user', async () => {
    const res = await agent.delete(`/api/users/${target.id}/follow`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('Followers');
    expect(res.body.data.Followers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: tester.id })])
    );
  });
});

// route - /api/posts
describe('Posts API scenario', () => {
  it('should search posts', async () => {
    const res = await agent.get(`/api/posts?cursor=0&size=10&q=${target.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ userid: target.id })])
    );
  });

  it("should create a user's post", async () => {
    const content = 'This article is for testing purposes only.';
    const image = path.resolve(__dirname, tester.image);

    const res = await agent
      .post('/api/posts')
      .type('form')
      .field('content', content)
      .field(
        'mediaInfo',
        JSON.stringify([
          { type: 'image', fileName: tester.image, width: 100, height: 100 },
        ])
      )
      .attach('images', image);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ data: { userid: tester.id, content } });
    expect(res.body.data.images).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          link: expect.stringMatching(new RegExp(tester.image + '$')),
        }),
      ])
    );
    tester.Post = res.body.data;
  });

  it('should get recommended posts', async () => {
    const res = await agent.get(
      '/api/posts/recommends?cursor=0&size=10&filter=all'
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Array) });
  });

  it("should get posts you're following", async () => {
    const res = await agent.get('/api/posts/followings?cursor=0&size=10');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Array) });
  });

  it("should get posts you're likes", async () => {
    const res = await agent.get('/api/posts/likes?cursor=0&size=10');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Array) });
  });

  it("should get posts you're bookmarks", async () => {
    const res = await agent.get('/api/posts/bookmarks?cursor=0&size=10');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Array) });
  });

  it("should get posts target's post", async () => {
    const res = await agent.get(
      `/api/posts/${target.Post?.postid}?userid=${target.id}`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { postid: target.Post?.postid, userid: target.id },
    });
  });

  it('should like a specific post', async () => {
    const res = await agent.post(`/api/posts/${target.Post?.postid}/hearts`);

    expect(res.status).toBe(201);
    expect(res.body.data.Hearts).toEqual(
      expect.arrayContaining([{ id: tester.id }])
    );
  });

  it('should cancle to like a specific post', async () => {
    const res = await agent.delete(`/api/posts/${target.Post?.postid}/hearts`);

    expect(res.status).toBe(200);
    expect(res.body.data.Hearts).not.toEqual(
      expect.arrayContaining([{ id: tester.id }])
    );
  });

  it('should repost a specific post', async () => {
    const res = await agent.post(`/api/posts/${target.Post?.postid}/reposts`);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ originalid: target.Post?.postid });
  });

  it('should delete a reposted post', async () => {
    const res = await agent.delete(`/api/posts/${target.Post?.postid}/reposts`);

    expect(res.status).toBe(204);
  });

  it("should get a specific post's comments", async () => {
    const res = await agent.get(
      `/api/posts/${target.Post?.postid}/comments?cursor=0&size=10&userid=${target.id}`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Array) });
  });

  it('should comment a specific post', async () => {
    const content = 'should comment a specific post';
    // const image = path.resolve(__dirname, tester.image);
    const res = await agent
      .post(`/api/posts/${target.Post?.postid}/comments`)
      .type('form')
      .field('content', content);
    // .field(
    //   'mediaInfo',
    //   JSON.stringify([
    //     {
    //       type: 'image',
    //       fileName: tester.image,
    //       width: 100,
    //       height: 100,
    //     },
    //   ])
    // )
    // .attach('images', image);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ data: { userid: tester.id, content } });
    // expect(res.body.data.images).toEqual(
    //   expect.arrayContaining([
    //     expect.objectContaining({
    //       link: expect.stringMatching(new RegExp(tester.image + '$')),
    //     }),
    //   ])
    // );
  });

  it("should get a my post's view", async () => {
    const res = await agent.get(`/api/posts/${tester.Post?.postid}/views`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        postid: tester.Post?.postid,
        impressions: expect.any(Number),
        engagements: expect.any(Number),
        detailexpands: expect.any(Number),
        newfollowers: expect.any(Number),
        profilevisit: expect.any(Number),
      },
    });
  });

  it("should add a post's view count", async () => {
    const res = await agent
      .post(`/api/posts/${target.Post?.postid}/views`)
      .send({ userid: target.id })
      .set({ accept: 'application/json' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      data: {
        postid: target.Post?.postid,
        _count: { Views: expect.any(Number) },
      },
    });
  });

  it('should bookmark a specific post', async () => {
    const res = await agent.post(`/api/posts/${target.Post?.postid}/bookmarks`);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      data: { postid: target.Post?.postid, Bookmarks: expect.any(Array) },
    });
    expect(res.body.data.Bookmarks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: tester.id })])
    );
  });

  it('should delete the bookmark for a specific post', async () => {
    const res = await agent.delete(
      `/api/posts/${target.Post?.postid}/bookmarks`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { postid: target.Post?.postid, Bookmarks: expect.any(Array) },
    });
    expect(res.body.data.Bookmarks).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: tester.id })])
    );
  });

  it("should get a speicific post's engagements", async () => {
    const res = await agent.get(
      `/api/posts/${target.Post?.postid}/engagements?cursor=0&size=10&userid=${target.id}&filter=likes`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: expect.any(Array),
      message: expect.any(String),
    });
  });

  it('should pin my post', async () => {
    const res = await agent.post(`/api/posts/${tester.Post?.postid}/pinned`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { postid: tester.Post?.postid, pinned: true },
    });
  });

  it('should delete pin for my post', async () => {
    const res = await agent.delete(`/api/posts/${tester.Post?.postid}/pinned`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { postid: tester.Post?.postid, pinned: false },
    });
  });

  it('should set scope for my post', async () => {
    const scope: Schemas['post']['scope'] = 'only';
    const res = await agent
      .post(`/api/posts/${tester.Post?.postid}/scope`)
      .send({ scope })
      .set({ accept: 'application/json' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { postid: tester.Post?.postid, scope },
    });
  });

  it('should get an image from a speicific post', async () => {
    if (typeof target.Post === 'undefined') {
      throw new Error("the target's post must be posted first");
    }

    const { imageId, link, width, height } = target.Post.images[0];
    const res = await agent.get(
      `/api/posts/${target.Post.postid}/photos/${imageId}`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { imageId, link, width, height },
    });
  });

  it("should deleted user's post", async () => {
    const res = await agent.delete(`/api/posts/${tester.Post?.postid}`);

    expect(res.status).toBe(204);
  });
});

// route - /api/rooms
describe('Rooms API scenario', () => {
  it('should get my rooms', async () => {
    const res = await agent.get('/api/rooms');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Array) });
  });

  it("should get room's notifications", async () => {
    const res = await agent.get('/api/rooms/notifications');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    for (const item of res.body.data) {
      expect(item).toMatchObject({
        id: expect.any(String),
        Notifications: expect.any(Number),
      });
    }
  });

  it('should get room information', async () => {
    const res = await agent.get(`/api/rooms/${roomid}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { id: roomid, senderid: tester.id, receiverid: target.id },
    });
    tester.Room = res.body.data;
  });

  it('should send message', (done) => {
    client.timeout(1000).emit(
      'message',
      {
        roomid,
        senderid: tester.id,
        content: 'This is a test message',
        media: null,
        parentid: null,
      },
      (err, data?: AdvancedMessages) => {
        if (err) {
          console.error(err);
        } else {
          // console.log('receive message', data);
        }
        done();
      }
    );
  });

  it('should disabled a room', async () => {
    const res = await agent.delete(`/api/rooms/${roomid}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { id: roomid, Disabled: true },
    });
  });

  it('should read messages', async () => {
    const res = await agent.post(`/api/rooms/${roomid}/seen`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { id: roomid, senderid: tester.id, sent: expect.any(Array) },
    });
  });

  it('should pin a room', async () => {
    const res = await agent.post(`/api/rooms/${roomid}/pin`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { id: roomid, Pinned: true },
    });
  });

  it('should unpin a room', async () => {
    const res = await agent.delete(`/api/rooms/${roomid}/pin`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { id: roomid, Pinned: false },
    });
  });

  it('should set to snooze a room', async () => {
    const res = await agent
      .post(`/api/rooms/${roomid}/snooze`)
      .send({
        snooze: 'forever',
      })
      .set({ accept: 'application/json' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { id: roomid, Snooze: { type: 'forever' } },
    });
  });

  it('should delete to snooze a room', async () => {
    const res = await agent.delete(`/api/rooms/${roomid}/snooze`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { id: roomid, Snooze: null },
    });
  });
});

// route - /api/messages
describe('Messages API scenario', () => {
  it('should search message', async () => {
    const q = 'test';
    const res = await agent.get(`/api/messages/search?cursor=0&size=10&q=${q}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: expect.any(Array),
    });
    for (const item of res.body.data) {
      expect(item).toMatchObject({
        content: expect.stringMatching(new RegExp(q)),
      });
    }
  });

  it('should get messages in room', async () => {
    const res = await agent.get(`/api/messages/${roomid}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: expect.any(Array),
    });
    for (const item of res.body.data) {
      expect(item).toMatchObject({
        roomid: roomid,
      });
    }
    tester.Messages = res.body.data;
  });

  it('should disable message', async () => {
    const res = await agent
      .delete(`/api/messages/${roomid}`)
      .send({
        messageid: tester.Messages?.at(0)?.id,
      })
      .set({ accept: 'application/json' });

    expect(res.status).toBe(204);
  });

  it('should add reaction for room', async () => {
    const res = await agent
      .post(`/api/messages/${roomid}/react`)
      .send({
        messageid: tester.Messages?.at(0)?.id,
        content: '👍',
      })
      .set({ accept: 'application/json' });

    expect(res.status).toBe(201);
  });

  it('should delete reaction for room', async () => {
    const res = await agent.delete(`/api/messages/${roomid}/react`).send({
      messageid: tester.Messages?.at(0)?.id,
    });

    expect(res.status).toBe(204);
  });
});

// route - /api/lists
describe('Lists API scenario', () => {
  it('should create my list', async () => {
    const image = path.resolve(__dirname, tester.image);
    const name = `${tester.id}'s list`;
    const description = `${tester.id}'s list is test list`;
    const make = 'public';

    const res = await agent
      .post('/api/lists')
      .type('form')
      .field('name', name)
      .field('description', description)
      .field('make', make)
      .attach('banner', image)
      .attach('thumbnail', image);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        userid: tester.id,
        name,
        description,
        make,
      },
    });
    tester.List = res.body.data;
  });

  it('should search list', async () => {
    const q = tester.id;
    const res = await agent.get(
      `/api/lists?cursor=0&size=10&q=${q}&includeSelf=on`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: expect.any(Array),
    });
    expect(
      res.body.data.every((item: AdvancedLists) => item.name.includes('test'))
    );
  });

  it('should get recommends lists', async () => {
    const res = await agent.get('/api/lists/recommends?cursor=0&size=10');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: expect.any(Array),
    });
  });

  it('should get a speicific lists', async () => {
    const res = await agent.get(
      `/api/lists/${tester.List?.id}?userid=${tester.List?.userid}`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        id: tester.List?.id,
        userid: tester.List?.userid,
      },
    });
  });

  it('should update my list', async () => {
    const edit = {
      name: 'edit ' + tester.List?.name,
      description: 'edit ' + tester.List?.description,
      image: path.resolve(__dirname, tester.image),
    };

    const res = await agent
      .post(`/api/lists/${tester.List?.id}/edit`)
      .type('form')
      .field('name', edit.name)
      .field('description', edit.description)
      .field('make', tester.List?.make || 'public')
      .attach('banner', edit.image);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        id: tester.List?.id,
        name: edit.name,
        description: edit.description,
        make: tester.List?.make,
      },
    });
  });

  it('should add member to a specific list', async () => {
    const res = await agent
      .post(`/api/lists/${tester.List?.id}/member`)
      .send({
        memberid: target.id,
      })
      .set({ accept: 'application/json' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      data: {
        id: tester.List?.id,
        Member: expect.arrayContaining([
          expect.objectContaining({ id: target.id }),
        ]),
      },
    });
  });

  it('should get members to a specific list', async () => {
    const res = await agent.get(
      `/api/lists/${tester.List?.id}/member?cursor=0&size=10`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: expect.any(Array),
    });
    expect(res.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: target.id })])
    );
  });

  it('should get posts to a specific list', async () => {
    const res = await agent.get(
      `/api/lists/${tester.List?.id}/posts?cursor=0&size=10`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: expect.any(Array),
    });
    expect(
      res.body.data.every((item: AdvancedPost) => item.userid === target.id)
    );
  });

  it('should remove member to a specific list', async () => {
    const res = await agent
      .delete(`/api/lists/${tester.List?.id}/member`)
      .send({
        memberid: target.id,
      })
      .set({ accept: 'application/json' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      data: {
        Member: expect.any(Array),
      },
    });
    expect(res.body.data.Member).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: target.id })])
    );
  });

  it('should follow a specific list', async () => {
    const res = await agent.post(`/api/lists/${target.List?.id}/follow`);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      data: {
        id: target.List?.id,
        Follower: expect.arrayContaining([
          expect.objectContaining({ id: tester.id }),
        ]),
      },
    });
  });

  it('should get follow info for a specific list', async () => {
    const res = await agent.get(
      `/api/lists/${target.List?.id}/follow?cursor=0&size=10`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: expect.any(Array),
    });
    expect(res.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: tester.id,
        }),
      ])
    );
  });

  it('should unfollow a specific list', async () => {
    const res = await agent.delete(`/api/lists/${target.List?.id}/follow`);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      data: {
        Follower: expect.any(Array),
      },
    });
    expect(res.body.data.Follower).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: tester.id })])
    );
  });

  it('should add post to a specific list', async () => {
    const res = await agent
      .post(`/api/lists/${tester.List?.id}/post`)
      .send({
        postid: target.Post?.postid,
      })
      .set({ accept: 'application/json' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        id: tester.List?.id,
        Posts: expect.arrayContaining([target.Post?.postid]),
      },
    });
  });

  it('should exclude post to a speicific list', async () => {
    const res = await agent
      .delete(`/api/lists/${tester.List?.id}/post`)
      .send({
        postid: target.Post?.postid,
      })
      .set({ accept: 'application/json' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { id: tester.List?.id, Posts: expect.any(Array) },
    });
    expect(res.body.data.Posts).not.toEqual(
      expect.arrayContaining([target.Post?.postid])
    );
  });

  it('should pin your following list', async () => {
    const res = await agent
      .post(`/api/lists/${tester.List?.id}/pinned`)
      .send({
        userid: tester.id,
      })
      .set({ accept: 'application/json' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        id: tester.List?.id,
        userid: tester.id,
        Pinned: true,
      },
    });
  });

  it('should unpin your following list', async () => {
    const res = await agent
      .delete(`/api/lists/${tester.List?.id}/pinned`)
      .send({
        userid: tester.id,
      })
      .set({ accept: 'application/json' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        id: tester.List?.id,
        userid: tester.id,
        Pinned: false,
      },
    });
  });

  it('should set the show a specific list', async () => {
    const res = await agent
      .post(`/api/lists/${tester.List?.id}/unshow`)
      .send({
        userid: tester.id,
      })
      .set({ accept: 'application/json' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        id: tester.List?.id,
        userid: tester.id,
        UnShow: expect.arrayContaining([
          expect.objectContaining({ id: tester.id }),
        ]),
      },
    });
  });

  it('should remove the show a speicific list', async () => {
    const res = await agent
      .delete(`/api/lists/${tester.List?.id}/unshow`)
      .send({
        userid: tester.id,
      })
      .set({ accept: 'application/json' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        id: tester.List?.id,
        userid: tester.id,
        UnShow: expect.any(Array),
      },
    });
    expect(res.body.data.UnShow).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: tester.id })])
    );
  });

  // finally delete myList
  it('should delete a my list', async () => {
    const res = await agent.delete(`/api/lists/${tester.List?.id}`);

    expect(res.status).toBe(204);
  });
});

// route - /api/hashtags
describe('Hashtgas API scenario', () => {
  it('should get hashtags', async () => {
    const res = await agent.get(`/api/hashtags/trends?cursor=0&size=10`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: expect.any(Array),
    });
    res.body.data.forEach((item: HashTags) => {
      expect(item).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          type: expect.stringMatching(/^(tag|word)$/),
          title: expect.any(String),
          count: expect.any(Number),
          weight: expect.any(Number),
        })
      );
    });
  });
});
