import path from 'path';
import fs from 'fs-extra';
import request from 'supertest';
import server, { uploadPath } from '@/app';
import DAO from '@/lib/DAO';
import { AdvancedUser } from '@/model/User';
import { AdvancedPost } from '@/model/Post';
import { Schemas } from '@/db/schema';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const agent = request.agent(server);
const tester = {
  id: 'jest',
  password: 'jest',
  newPassword: 'jest123',
  nickname: 'jest',
  image: 'jest.png',
};
const target = { id: 'elonmusk', postid: 1, imageId: 1 };

beforeAll((done) => {
  done();
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
});

// route - /api
describe('Login API scenario', () => {
  let user: AdvancedUser;

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
describe('User API scenario', () => {
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
describe('Post API scenario', () => {
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
    const image = path.resolve(__dirname, tester.image);
    const res = await agent
      .post(`/api/posts/${target.postid}/comments`)
      .type('form')
      .field('content', content)
      .field(
        'mediaInfo',
        JSON.stringify([
          {
            type: 'image',
            fileName: tester.image,
            width: 100,
            height: 100,
          },
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
