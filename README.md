# xclone_express

이 프로젝트는 [Xclone](https://github.com/seodevv/xclone) 웹 어플리케이션이 기반이 되는 백엔드 어플리케이션입니다.

- **Typescript**를 기반으로 작성되었으며, `express`로 **REST API**가 구현되어 있습니다.

- 웹 어플리케이션의 채팅을 위해 `/messages` 네임스페이스를 가지는 `socket.io` 서버도 함께 올라갑니다.

- **node**의 `cluster`를 사용 중입니다. `.env` 파일의 `MAX_WORKER`의 수를 지정해주면 하나의 *primary*와 `n`의 *worker*가 구동됩니다.(`MAX_WORKER`가 서버가 보유한 **cpus**보다 높은 경우 **cpus** 수량만큼 *worker*가 구동됩니다.)

- 데이터베이스는 [postgresql 16](https://www.postgresql.org/)을 사용하며, `.env` 파일에 접속 정보를 넣으면 서버가 최초로 실행될 때 필요한 DDL을 자동 생성합니다.

- 이 프로젝트는 [Epretx](https://epretx.etri.re.kr/)의 [언어 분석 기술](https://epretx.etri.re.kr/apiDetail?id=2) API를 사용합니다. 사용을 원하는 경우 `.env` 파일의 `AI_OPEN_ETRI_API_KEY`의 정보를 넣으면 해당 기능을 사용할 수 있습니다.

- 테스팅 툴로 `Jest`를 사용합니다. 해당 툴을 활용해 구현되어 있는 REST API 전부를 테스팅합니다.

# Started

## required environment

```dotenv
# .env
PGSSL=false
PGUSER=xclone
PGPASSWORD=xclone
PGHOST=localhost
PGPORT=5432
PGDATABASE=xclone
PGSCHEMA=xclone_schema
```

이 프로젝트는 [Postgresql 16](https://www.postgresql.org/)을 기반으로 구동됩니다. 따라서 **Postgresql DB**의 **접속 정보**를 필요로 합니다.

- AWS RDS를 사용할 경우 **region**에 맞는 `pem` 파일과 함께 `PGSSL=true`를 활성화 해주어야 합니다.

## development

```bash
npm run dev
```

## production

```bash
npm run build
npm run start
```

## production with pm2

```bash
npm run build:restart
# or
npm run build
pm2 start pm2.config.js
```

# environment

이 프로젝트는 `.env` 파일에 아래와 같은 변수들을 가집니다.

```dotenv
### Node environment
NODE_ENV=development

### Server environment
SERVER_HOST=localhost
SERVER_PORT=9090
SERVER_ORIGIN=https://localhost,https://localhost:3000

## Postgres DB
## if use AWS RDS, must use ssl.
# PGSSL=true
# PGHOST=ap-northeast-2.rds.amazonaws.com
PGUSER=xclone
PGPASSWORD=xclone
PGHOST=localhost
PGPORT=5432
PGDATABASE=xclone
PGSCHEMA=xclone_schema

## jwt token secret
JWT_SECRET=secret

### epretx.etri.re.kr
AI_OPEN_ETRI_API_URL=http://epretx.etri.re.kr:8000/api/WiseNLU_spoken
AI_OPEN_ETRI_API_KEY=
```

1. NODE_ENV : 노드의 상태를 나타내며 development, production, test를 가집니다.

2. SERVER_HOST : 호스트 서버의 주소를 나타냅니다.
3. SERVER_PORT : 호스트 서버의 포트를 나타냅니다.
4. SERVER_ORIGIN : cors 정책의 origin을 설정합니다.
5. PG\* : PostgreSQL DB의 접속 정보를 나타냅니다.

- AWS RDS를 사용할 경우 `PGSSL=true`를 활성화가 필요합니다.
- AWS RDS에 맞는 *region*의 `pem` 파일이 필요로 합니다.

6. JWT_SECRET : `jsonwebtoken`에서 사용할 `secret`을 나타냅니다.
7. AI_OPEN_ETRI_API_URL : [Epretx](https://epretx.etri.re.kr) API 서비스의 요청 URL을 나타냅니다.
8. AI_OPEN_ETRI_API_KEY : [Epretx](https://epretx.etri.re.kr) API 서비스를 사용하기 위한 *KEY*를 나타냅니다.

# socket.io

[Xclone](https://github.com/seodevv/xclone)에서 사용되는 `socket.io` 서버가 구현되어 있습니다.

- `express` 서버 구동 시 자동으로 구동되며, 동일한 도메인을 사용합니다.
- 네임스페이스는 `/messages`를 사용합니다.

  ```bash
    [server ip]:[server port]/messages
  ```

- 클라이언트에서 `io` 정의 시 `auth.sessionid`에 현재 로그인 중인 sessionid를 담아 선언합니다.

### client-side

```ts
import { io } from 'socket.io-client';

const myid = 'seodevv';
const socket = io('[server ip]:[server port]/messages', {
  auth: {
    sessionid: myid,
  },
});
```

# cluster

`node`의 `cluster`를 사용하여 다수의 *worker*로 서버를 구동할 수 있습니다.

- `.env`의 `MAX_WORKER` 변수에 따라 _worker_ 수를 지정할 수 있습니다.
- `MAX_WORKER`가 `os`의 `cpus`보다 많을 경우 `cpus`의 수 만큼 *worker*가 구동됩니다.
- *worker*가 종료되는 경우 *primary*가 *worker*를 다시 실행시킵니다.

# Epretx
