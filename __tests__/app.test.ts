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

interface CustomSocket
  extends Socket<ServerToClientEvents, ClientToServerEvents> {
  data?: {
    sessionId: string;
  };
}

process.env.NODE_NEV = 'test';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const agent = request.agent(server);
const tester = {
  id: 'jest',
  password: 'jest',
  newPassword: 'jest123',
  nickname: 'jest',
  image: 'jest.png',
};
const target = { id: 'elonmusk', postid: 1, imageId: 1, listid: 14 };
const roomid = encryptRoomId(tester.id, target.id);
let client: CustomSocket;

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.on('listening', () => {
      resolve();
    });
    server.on('error', (err) => {
      reject(err);
    });
  });

  await new Promise<void>((resolve, reject) => {
    client = io('https://127.0.0.1:9090/messages', {
      rejectUnauthorized: false,
      retries: 0,
      auth: {
        sessionId: tester.id,
      },
    });
    client.on('connect', () => {
      resolve();
    });
    client.on('connect_error', (err) => {
      console.error(err);
      reject();
    });
  });
});

afterAll(async () => {
  const dao = new DAO();
  const user = await dao.getUser({ id: tester.id });
  if (typeof user?.image !== 'undefined') {
    const imagePath = path.resolve(uploadPath, user.image);
    fs.removeSync(imagePath);
  }
  await dao.deleteUser({ id: tester.id });
  dao.release();

  await new Promise<void>((resolve) => {
    client.once('disconnect', () => resolve());
    client.close();
  });

  await new Promise<void>((resolve, rejcet) => {
    server.close((err) => {
      if (err) return rejcet(err);
      resolve();
    });
  });
});

// route - /api
describe('Login API scenario', () => {
  let user: AdvancedUser;

  it('should create a new user', async () => {
    const res = await agent
      .post('/api/users')
      // .type('form')
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
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { id: tester.id } });
  });

  it('should changed password', async () => {
    const res = await agent
      .post('/api/password')
      .send({
        current: tester.password,
        newPassword: tester.newPassword,
      })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { id: tester.id } });
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
      .field('password', tester.newPassword);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { id: tester.id } });

    user = res.body.data;
  });

  it('should receive image in response', async () => {
    const res = await agent.get(`/api/image/${user.image}`);

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

  it('should updated my birth', async () => {
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

  it('should updated birth', async () => {
    const res = await agent.delete('/api/users/birth');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { id: tester.id, birth: null } });
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
  let post: AdvancedPost;

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

    post = res.body.data;
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
      `/api/posts/${target.postid}?userid=${target.id}`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { postid: target.postid, userid: target.id },
    });
  });

  it('should like a specific post', async () => {
    const res = await agent.post(`/api/posts/${target.postid}/hearts`);

    expect(res.status).toBe(201);
    expect(res.body.data.Hearts).toEqual(
      expect.arrayContaining([{ id: tester.id }])
    );
  });

  it('should cancle to like a specific post', async () => {
    const res = await agent.delete(`/api/posts/${target.postid}/hearts`);

    expect(res.status).toBe(200);
    expect(res.body.data.Hearts).not.toEqual(
      expect.arrayContaining([{ id: tester.id }])
    );
  });

  it('should repost a specific post', async () => {
    const res = await agent.post(`/api/posts/${target.postid}/reposts`);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ originalid: target.postid });
  });

  it('should delete a reposted post', async () => {
    const res = await agent.delete(`/api/posts/${target.postid}/reposts`);

    expect(res.status).toBe(204);
  });

  it("should get a specific post's comments", async () => {
    const res = await agent.get(
      `/api/posts/${target.postid}/comments?cursor=0&size=10&userid=${target.id}`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Array) });
  });

  it('should comment a specific post', async () => {
    const content = 'should comment a specific post';
    // const image = path.resolve(__dirname, tester.image);
    const res = await agent
      .post(`/api/posts/${target.postid}/comments`)
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
    const res = await agent.get(`/api/posts/${post.postid}/views`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        postid: post.postid,
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
      .post(`/api/posts/${target.postid}/views`)
      .send({ userid: target.id })
      .set('Accept', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      data: { postid: target.postid, _count: { Views: expect.any(Number) } },
    });
  });

  it('should bookmark a specific post', async () => {
    const res = await agent.post(`/api/posts/${target.postid}/bookmarks`);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      data: { postid: target.postid, Bookmarks: expect.any(Array) },
    });
    expect(res.body.data.Bookmarks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: tester.id })])
    );
  });

  it('should delete the bookmark for a specific post', async () => {
    const res = await agent.delete(`/api/posts/${target.postid}/bookmarks`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { postid: target.postid, Bookmarks: expect.any(Array) },
    });
    expect(res.body.data.Bookmarks).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: tester.id })])
    );
  });

  it("should get a speicific post's engagements", async () => {
    const res = await agent.get(
      `/api/posts/${target.postid}/engagements?cursor=0&size=10&userid=${target.id}&filter=likes`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: expect.any(Array),
      message: expect.any(String),
    });
  });

  it('should pin my post', async () => {
    const res = await agent.post(`/api/posts/${post.postid}/pinned`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { postid: post.postid, pinned: true },
    });
  });

  it('should delete pin for my post', async () => {
    const res = await agent.delete(`/api/posts/${post.postid}/pinned`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { postid: post.postid, pinned: false },
    });
  });

  it('should set scope for my post', async () => {
    const scope: Schemas['post']['scope'] = 'only';
    const res = await agent
      .post(`/api/posts/${post.postid}/scope`)
      .send({ scope })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { postid: post.postid, scope } });
  });

  it('should get an image from a speicific post', async () => {
    const { imageId, link, width, height } = post.images[0];
    const res = await agent.get(`/api/posts/${post.postid}/photos/${imageId}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { imageId, link, width, height },
    });
  });

  it("should deleted user's post", async () => {
    const res = await agent.delete(`/api/posts/${post.postid}`);

    expect(res.status).toBe(204);
  });
});

// route - /api/rooms
describe('Rooms API scenario', () => {
  let room: AdvancedRooms;

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

    room = res.body.data;
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
      .set('Accept', 'application/json');

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
  let messages: AdvancedMessages[];

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

    messages = res.body.data;
  });

  it('should disable message', async () => {
    const res = await agent
      .delete(`/api/messages/${roomid}`)
      .send({
        messageid: messages[0].id,
      })
      .set('Accept', 'application/json');

    expect(res.status).toBe(204);
  });

  it('should add reaction for room', async () => {
    const res = await agent
      .post(`/api/messages/${roomid}/react`)
      .send({
        messageid: messages[0].id,
        content: '👍',
      })
      .set('Accept', 'application/json');

    expect(res.status).toBe(201);
  });

  it('should delete reaction for room', async () => {
    const res = await agent.delete(`/api/messages/${roomid}/react`).send({
      messageid: messages[0].id,
    });

    expect(res.status).toBe(204);
  });
});

// route - /api/lists
describe('Lists API scenario', () => {
  let myList: AdvancedLists;

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
    myList = res.body.data;
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
      `/api/lists/${myList.id}?userid=${myList.userid}`
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        id: myList.id,
        userid: myList.userid,
      },
    });
  });

  it('should update my list', async () => {
    const edit = {
      name: 'edit ' + myList.name,
      description: 'edit ' + myList.description,
      image: path.resolve(__dirname, tester.image),
    };

    const res = await agent
      .post(`/api/lists/${myList.id}/edit`)
      .type('form')
      .field('name', edit.name)
      .field('description', edit.description)
      .field('make', myList.make)
      .attach('banner', edit.image);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        id: myList.id,
        name: edit.name,
        description: edit.description,
        make: myList.make,
      },
    });
  });

  it('should add member to a specific list', async () => {
    const res = await agent
      .post(`/api/lists/${myList.id}/member`)
      .send({
        memberid: target.id,
      })
      .set('Accept', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      data: {
        id: myList.id,
        Member: expect.arrayContaining([
          expect.objectContaining({ id: target.id }),
        ]),
      },
    });
  });

  it('should get members to a specific list', async () => {
    const res = await agent.get(
      `/api/lists/${myList.id}/member?cursor=0&size=10`
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
      `/api/lists/${myList.id}/posts?cursor=0&size=10`
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
      .delete(`/api/lists/${myList.id}/member`)
      .send({
        memberid: target.id,
      })
      .set('Accept', 'application/json');

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
    const res = await agent.post(`/api/lists/${target.listid}/follow`);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      data: {
        id: target.listid,
        Follower: expect.arrayContaining([
          expect.objectContaining({ id: tester.id }),
        ]),
      },
    });
  });

  it('should get follow info for a specific list', async () => {
    const res = await agent.get(
      `/api/lists/${target.listid}/follow?cursor=0&size=10`
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
    const res = await agent.delete(`/api/lists/${target.listid}/follow`);

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
      .post(`/api/lists/${myList.id}/post`)
      .send({
        postid: target.postid,
      })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { id: myList.id, Posts: expect.arrayContaining([target.postid]) },
    });
  });

  it('should exclude post to a speicific list', async () => {
    const res = await agent
      .delete(`/api/lists/${myList.id}/post`)
      .send({
        postid: target.postid,
      })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { id: myList.id, Posts: expect.any(Array) },
    });
    expect(res.body.data.Posts).not.toEqual(
      expect.arrayContaining([target.postid])
    );
  });

  it('should pin your following list', async () => {
    const res = await agent
      .post(`/api/lists/${myList.id}/pinned`)
      .send({
        userid: tester.id,
      })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        id: myList.id,
        userid: tester.id,
        Pinned: true,
      },
    });
  });

  it('should unpin your following list', async () => {
    const res = await agent
      .delete(`/api/lists/${myList.id}/pinned`)
      .send({
        userid: tester.id,
      })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        id: myList.id,
        userid: tester.id,
        Pinned: false,
      },
    });
  });

  it('should set the show a specific list', async () => {
    const res = await agent
      .post(`/api/lists/${myList.id}/unshow`)
      .send({
        userid: tester.id,
      })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        id: myList.id,
        userid: tester.id,
        UnShow: expect.arrayContaining([
          expect.objectContaining({ id: tester.id }),
        ]),
      },
    });
  });

  it('should remove the show a speicific list', async () => {
    const res = await agent
      .delete(`/api/lists/${myList.id}/unshow`)
      .send({
        userid: tester.id,
      })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        id: myList.id,
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
    const res = await agent.delete(`/api/lists/${myList.id}`);

    expect(res.status).toBe(204);
    myList;
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
